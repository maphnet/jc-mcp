import { describe, it, expect, afterEach, vi } from "vitest";
import { request } from "node:http";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { ElicitRequestSchema, LATEST_PROTOCOL_VERSION } from "@modelcontextprotocol/sdk/types.js";
import type { AtlassianClient } from "../src/client.js";
import {
  startHttpServer,
  httpOptionsFromEnv,
  type HttpServerHandle,
} from "../src/http-transport.js";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function fakeClient() {
  const jiraPut = vi.fn(async (_path: string, _body: unknown) => undefined);
  const client = {
    jiraGet: async (path: string) => {
      await sleep(Math.random() * 20); // force interleaving across sessions
      const key = path.split("/").pop()!;
      return { key, fields: { summary: `summary of ${key}` } };
    },
    jiraPut,
  } as unknown as AtlassianClient;
  return { client, jiraPut };
}

let handle: HttpServerHandle | undefined;
const clients: Client[] = [];

afterEach(async () => {
  await Promise.allSettled(clients.splice(0).map((c) => c.close()));
  await handle?.close().catch(() => {});
  handle = undefined;
  delete process.env.JCM_CONFIRM_WRITES;
});

async function start(client: AtlassianClient, idleTimeoutMs = 60_000) {
  handle = await startHttpServer(client, {
    host: "127.0.0.1",
    port: 0,
    path: "/mcp",
    idleTimeoutMs,
  });
  return handle;
}

// Rejects the client's standalone GET SSE stream with a 405, which the SDK treats as
// "server doesn't offer one" (no error). Forces any server->client message, including
// elicitation prompts, onto the POST response stream via relatedRequestId.
const rejectGetFetch: typeof fetch = (input, init) =>
  init?.method === "GET" ? Promise.resolve(new Response(null, { status: 405 })) : fetch(input, init);

async function connect(
  h: HttpServerHandle,
  onElicit?: (message: string) => "accept" | "decline",
  opts?: { noGetStream?: boolean }
) {
  const client = new Client(
    { name: "test", version: "0.0.0" },
    onElicit ? { capabilities: { elicitation: { form: {} } } } : undefined
  );
  client.onerror = () => {};
  if (onElicit) {
    client.setRequestHandler(ElicitRequestSchema, async (req) =>
      onElicit(req.params.message) === "accept"
        ? ({ action: "accept", content: { confirm: true } } as const)
        : ({ action: "decline" } as const)
    );
  }
  const transport = new StreamableHTTPClientTransport(
    new URL(h.url),
    opts?.noGetStream ? { fetch: rejectGetFetch } : undefined
  );
  await client.connect(transport);
  clients.push(client);
  return { client, transport };
}

async function callJson(client: Client, name: string, args: Record<string, unknown>) {
  const result = await client.callTool({ name, arguments: args });
  return JSON.parse((result.content as Array<{ text: string }>)[0].text);
}

function raw(
  port: number,
  opts: {
    method: string;
    path?: string;
    headers?: Record<string, string>;
    body?: string;
    connectHost?: string;
  }
) {
  return new Promise<{ status: number; body: string }>((resolve, reject) => {
    const req = request(
      {
        host: opts.connectHost ?? "127.0.0.1",
        port,
        method: opts.method,
        path: opts.path ?? "/mcp",
        headers: {
          "content-type": "application/json",
          accept: "application/json, text/event-stream",
          ...opts.headers,
        },
      },
      (res) => {
        let body = "";
        res.setEncoding("utf8");
        res.on("data", (c) => (body += c));
        res.on("end", () => resolve({ status: res.statusCode ?? 0, body }));
      }
    );
    // ponytail: Node's default (non-keepAlive) agent tears down the client socket as soon
    // as the server responds, even if the request body write hasn't fully flushed to the
    // kernel yet — a benign race on the oversized-body test. The write failure can surface
    // either as a ClientRequest 'error' or, once the request is considered "finished", as a
    // bare socket write error with no request-level listener — so swallow ECONNRESET/EPIPE
    // on both, scoped to this one request only. The response status assertion (when it
    // arrives) still proves server behavior.
    const tolerate = (err: NodeJS.ErrnoException) => {
      if (err.code === "ECONNRESET" || err.code === "EPIPE") return;
      reject(err);
    };
    req.on("error", tolerate);
    req.on("socket", (socket) => socket.on("error", tolerate));
    req.end(opts.body);
  });
}

const INIT = JSON.stringify({
  jsonrpc: "2.0",
  id: 1,
  method: "initialize",
  params: {
    protocolVersion: LATEST_PROTOCOL_VERSION,
    capabilities: {},
    clientInfo: { name: "raw", version: "0" },
  },
});
const PING = JSON.stringify({ jsonrpc: "2.0", id: 2, method: "ping" });

describe("httpOptionsFromEnv", () => {
  it("defaults to loopback:3000/mcp with a 30 min idle timeout", () => {
    expect(httpOptionsFromEnv({})).toEqual({
      host: "127.0.0.1",
      port: 3000,
      path: "/mcp",
      idleTimeoutMs: 1_800_000,
    });
  });

  it("reads overrides", () => {
    expect(
      httpOptionsFromEnv({
        JCM_HTTP_HOST: "::1",
        JCM_HTTP_PORT: "3101",
        JCM_HTTP_PATH: "/jc",
        JCM_HTTP_IDLE_TIMEOUT_MS: "5000",
      })
    ).toEqual({ host: "::1", port: 3101, path: "/jc", idleTimeoutMs: 5000 });
  });

  it("rejects invalid port and timeout", () => {
    expect(() => httpOptionsFromEnv({ JCM_HTTP_PORT: "abc" })).toThrow(/JCM_HTTP_PORT/);
    expect(() => httpOptionsFromEnv({ JCM_HTTP_IDLE_TIMEOUT_MS: "0" })).toThrow(
      /JCM_HTTP_IDLE_TIMEOUT_MS/
    );
  });

  it("falls back to the default port when JCM_HTTP_PORT is empty", () => {
    expect(httpOptionsFromEnv({ JCM_HTTP_PORT: "" }).port).toBe(3000);
  });

  it("rejects wildcard hosts", () => {
    expect(() => httpOptionsFromEnv({ JCM_HTTP_HOST: "0.0.0.0" })).toThrow(/JCM_HTTP_HOST/);
    expect(() => httpOptionsFromEnv({ JCM_HTTP_HOST: "::" })).toThrow(/JCM_HTTP_HOST/);
  });
});

describe("startHttpServer wildcard bind guard", () => {
  it("rejects a host spelling (\"0\") that Node resolves to the wildcard address, leaving no listener behind", async () => {
    await expect(
      startHttpServer(fakeClient().client, { host: "0", port: 0, path: "/mcp", idleTimeoutMs: 60_000 })
    ).rejects.toThrow(/wildcard/);
  });

  it("accepts the expanded IPv6 loopback spelling and matches Host: [::1]:<port>", async () => {
    let h: HttpServerHandle;
    try {
      h = await startHttpServer(fakeClient().client, {
        host: "0:0:0:0:0:0:0:1",
        port: 0,
        path: "/mcp",
        idleTimeoutMs: 60_000,
      });
    } catch (err) {
      // No IPv6 loopback available in this environment (e.g. some CI sandboxes).
      if ((err as NodeJS.ErrnoException).code === "EADDRNOTAVAIL") return;
      throw err;
    }
    try {
      const res = await raw(h.port, {
        method: "POST",
        path: "/mcp",
        connectHost: "::1",
        headers: { host: `[::1]:${h.port}` },
        body: INIT,
      });
      expect(res.status).toBe(200);
    } finally {
      await h.close();
    }
  });
});

describe("startHttpServer request guards", () => {
  it("returns 404 for a non-matching path", async () => {
    const h = await start(fakeClient().client);
    const res = await raw(h.port, { method: "POST", path: "/other", body: INIT });
    expect(res.status).toBe(404);
  });

  it("returns a JSON-RPC parse error (400) for invalid JSON", async () => {
    const h = await start(fakeClient().client);
    const res = await raw(h.port, { method: "POST", body: "{not json" });
    expect(res.status).toBe(400);
    expect(JSON.parse(res.body).error.code).toBe(-32700);
  });

  it("rejects a foreign Host header with 403 (DNS rebinding protection)", async () => {
    const h = await start(fakeClient().client);
    const res = await raw(h.port, {
      method: "POST",
      headers: { host: "evil.example:80" },
      body: INIT,
    });
    expect(res.status).toBe(403);
  });

  it("accepts localhost:<port> when bound to 127.0.0.1", async () => {
    const h = await start(fakeClient().client);
    const res = await raw(h.port, {
      method: "POST",
      headers: { host: `localhost:${h.port}` },
      body: INIT,
    });
    expect(res.status).toBe(200);
  });

  it("returns 404 for an unknown session id", async () => {
    const h = await start(fakeClient().client);
    const res = await raw(h.port, {
      method: "POST",
      headers: { "mcp-session-id": "does-not-exist" },
      body: PING,
    });
    expect(res.status).toBe(404);
  });

  it("returns 400 for a non-initialize request without a session id", async () => {
    const h = await start(fakeClient().client);
    const res = await raw(h.port, { method: "POST", body: PING });
    expect(res.status).toBe(400);
  });

  it("rejects a foreign Origin header with 403", async () => {
    const h = await start(fakeClient().client);
    const res = await raw(h.port, {
      method: "POST",
      headers: { origin: "http://evil.example" },
      body: INIT,
    });
    expect(res.status).toBe(403);
  });

  it("accepts a matching loopback Origin", async () => {
    const h = await start(fakeClient().client);
    const res = await raw(h.port, {
      method: "POST",
      headers: { origin: `http://127.0.0.1:${h.port}` },
      body: INIT,
    });
    expect(res.status).toBe(200);
  });

  it("returns 415 for a non-JSON Content-Type", async () => {
    const h = await start(fakeClient().client);
    const res = await raw(h.port, {
      method: "POST",
      headers: { "content-type": "text/plain" },
      body: INIT,
    });
    expect(res.status).toBe(415);
  });

  it("returns 413 for a body over the size cap", async () => {
    const h = await start(fakeClient().client);
    const MAX_BODY_BYTES = 4 * 1024 * 1024;
    const oversized = JSON.stringify({
      ...JSON.parse(INIT),
      padding: "x".repeat(MAX_BODY_BYTES + 1024),
    });
    const res = await raw(h.port, { method: "POST", body: oversized });
    expect(res.status).toBe(413);
  });

});

describe("startHttpServer session isolation", () => {
  it("keeps concurrent sessions' responses separate under overlapping request ids", async () => {
    const h = await start(fakeClient().client);
    const a = await connect(h);
    const b = await connect(h);

    expect(a.transport.sessionId).toBeDefined();
    expect(a.transport.sessionId).not.toBe(b.transport.sessionId);
    expect(h.sessionCount()).toBe(2);

    // Both clients number their requests from the same starting id, so ids overlap.
    const calls = Array.from({ length: 10 }, (_, i) => [
      callJson(a.client, "jcm_getIssue", { issueKey: `AAA-${i + 1}` }).then((r) => [
        "AAA",
        i + 1,
        r.key,
      ]),
      callJson(b.client, "jcm_getIssue", { issueKey: `BBB-${i + 1}` }).then((r) => [
        "BBB",
        i + 1,
        r.key,
      ]),
    ]).flat();

    for (const [prefix, n, key] of await Promise.all(calls)) {
      expect(key).toBe(`${prefix}-${n}`);
    }
  });
});

describe("startHttpServer elicitation routing", () => {
  it("prompts only the session that triggered the write; a decline does not affect others", async () => {
    process.env.JCM_CONFIRM_WRITES = "true";
    const { client: atlassian, jiraPut } = fakeClient();
    const h = await start(atlassian);

    const seenA: string[] = [];
    const seenB: string[] = [];
    const a = await connect(h, (m) => (seenA.push(m), "accept"), { noGetStream: true });
    const b = await connect(h, (m) => (seenB.push(m), "decline"), { noGetStream: true });

    const [resA, resB] = await Promise.all([
      callJson(a.client, "jcm_editIssue", { issueKey: "AAA-1", fields: { summary: "x" } }),
      callJson(b.client, "jcm_editIssue", { issueKey: "BBB-1", fields: { summary: "y" } }),
    ]);

    expect(resA).toEqual({ ok: true, key: "AAA-1" });
    expect(resB.ok).toBe(false);
    expect(resB.message).toContain("declined");

    expect(seenA).toHaveLength(1);
    expect(seenA[0]).toContain("AAA-1");
    expect(seenB).toHaveLength(1);
    expect(seenB[0]).toContain("BBB-1");

    expect(jiraPut).toHaveBeenCalledTimes(1);
    expect(jiraPut.mock.calls[0][0]).toBe("/rest/api/3/issue/AAA-1");

    // The declining session keeps working.
    expect((await callJson(b.client, "jcm_getIssue", { issueKey: "BBB-2" })).key).toBe("BBB-2");
  });
});

describe("startHttpServer session lifecycle", () => {
  it("removes a session on DELETE and 404s its stale id", async () => {
    const h = await start(fakeClient().client);
    const { transport } = await connect(h);
    const id = transport.sessionId!;

    await transport.terminateSession();

    expect(h.sessionCount()).toBe(0);
    const res = await raw(h.port, { method: "POST", headers: { "mcp-session-id": id }, body: PING });
    expect(res.status).toBe(404);
  });

  it("sweeps a client that vanished without DELETE after the idle timeout", async () => {
    const h = await start(fakeClient().client, 50);
    const { client, transport } = await connect(h);
    const id = transport.sessionId!;

    await client.close(); // drops connections, sends no DELETE (simulates a crash)
    await sleep(300);

    expect(h.sessionCount()).toBe(0);
    const res = await raw(h.port, { method: "POST", headers: { "mcp-session-id": id }, body: PING });
    expect(res.status).toBe(404);
  });

  it("does not sweep a connected client holding an open SSE stream", async () => {
    // idleTimeoutMs=100ms: the normal cutoff is 100ms, the hard reclaim cutoff is
    // 4x = 400ms. Sleeping 200ms is 2x past the normal cutoff (proving the open
    // stream — not timing luck — is what keeps it alive) and 2x short of the hard
    // cutoff, giving slack on both sides instead of a 200ms/400ms photo finish.
    const h = await start(fakeClient().client, 100);
    const { client } = await connect(h);

    await sleep(200);

    expect(h.sessionCount()).toBe(1);
    expect((await callJson(client, "jcm_getIssue", { issueKey: "AAA-9" })).key).toBe("AAA-9");
  });

  it("does not leak sessions across repeated connect/disconnect cycles", async () => {
    const h = await start(fakeClient().client);
    for (let i = 0; i < 25; i++) {
      const { client, transport } = await connect(h);
      await transport.terminateSession();
      await client.close();
    }
    expect(h.sessionCount()).toBe(0);
  });

  it("close() shuts down all sessions and stops listening", async () => {
    const h = await start(fakeClient().client);
    await connect(h);
    await connect(h);
    expect(h.sessionCount()).toBe(2);

    await h.close();

    expect(h.sessionCount()).toBe(0);
    await expect(raw(h.port, { method: "POST", body: PING })).rejects.toThrow();
  });
});
