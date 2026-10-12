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

async function connect(
  h: HttpServerHandle,
  onElicit?: (message: string) => "accept" | "decline"
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
  const transport = new StreamableHTTPClientTransport(new URL(h.url));
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
  opts: { method: string; path?: string; headers?: Record<string, string>; body?: string }
) {
  return new Promise<{ status: number; body: string }>((resolve, reject) => {
    const req = request(
      {
        host: "127.0.0.1",
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
    req.on("error", reject);
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
