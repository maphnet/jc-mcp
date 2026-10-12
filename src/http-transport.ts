import {
  createServer as createHttpServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import type { AddressInfo } from "node:net";
import { randomUUID } from "node:crypto";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import type { AtlassianClient } from "./client.js";
import { createServer } from "./server.js";

export interface HttpOptions {
  host: string;
  port: number;
  path: string;
  idleTimeoutMs: number;
}

export interface HttpServerHandle {
  port: number;
  url: string;
  sessionCount(): number;
  close(): Promise<void>;
}

interface Session {
  transport: StreamableHTTPServerTransport;
  lastActivity: number;
  /** In-flight requests + open SSE streams; sessions with any open are never swept. */
  openRequests: number;
}

const LOOPBACK = ["127.0.0.1", "localhost", "::1"];
const WILDCARD_HOSTS = ["0.0.0.0", "::", "[::]"];
const MAX_BODY_BYTES = 4 * 1024 * 1024;

const bracket = (host: string) => (host.includes(":") ? `[${host}]` : host);

export function httpOptionsFromEnv(env: NodeJS.ProcessEnv = process.env): HttpOptions {
  const port = Number(env.JCM_HTTP_PORT || 3000);
  const idleTimeoutMs = Number(env.JCM_HTTP_IDLE_TIMEOUT_MS || 1_800_000);
  const host = env.JCM_HTTP_HOST || "127.0.0.1";
  if (!Number.isInteger(port) || port < 0 || port > 65535) {
    throw new Error(`Invalid JCM_HTTP_PORT: ${env.JCM_HTTP_PORT}`);
  }
  if (!Number.isFinite(idleTimeoutMs) || idleTimeoutMs <= 0) {
    throw new Error(`Invalid JCM_HTTP_IDLE_TIMEOUT_MS: ${env.JCM_HTTP_IDLE_TIMEOUT_MS}`);
  }
  if (WILDCARD_HOSTS.includes(host)) {
    throw new Error(
      `Invalid JCM_HTTP_HOST: ${host} is a wildcard bind; use a specific loopback or host address`
    );
  }
  return {
    host,
    port,
    path: env.JCM_HTTP_PATH || "/mcp",
    idleTimeoutMs,
  };
}

const UNSPECIFIED_ADDRESSES = ["0.0.0.0", "::"];

/**
 * Host header values accepted for DNS-rebinding protection. Built from both the
 * configured host and the actual bound address (Node normalizes spellings like
 * "0:0:0:0:0:0:0:1" to "::1"), so unusual-but-equivalent host spellings don't
 * slip past the configured-host-only check. Loopback binds accept every loopback name.
 */
function allowedHostsFor(host: string, boundAddress: string, port: number): Set<string> {
  const isLoopback = LOOPBACK.includes(host) || LOOPBACK.includes(boundAddress);
  const names = isLoopback ? [...LOOPBACK, host, boundAddress] : [host, boundAddress];
  return new Set(names.map((h) => `${bracket(h)}:${port}`));
}

class PayloadTooLargeError extends Error {}

/** Reads and parses a JSON body, discarding (not buffering) bytes past the cap so memory stays bounded. */
function readJsonCapped(req: IncomingMessage, maxBytes: number): Promise<unknown> {
  return new Promise((resolve, reject) => {
    let total = 0;
    let tooLarge = false;
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => {
      if (tooLarge) return;
      total += chunk.length;
      if (total > maxBytes) {
        tooLarge = true;
        chunks.length = 0;
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
      if (tooLarge) return reject(new PayloadTooLargeError());
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")));
      } catch (err) {
        reject(err);
      }
    });
    req.on("error", reject);
  });
}

function sendError(res: ServerResponse, status: number, code: number, message: string): void {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify({ jsonrpc: "2.0", error: { code, message }, id: null }));
}

/**
 * Starts a Streamable HTTP MCP endpoint. Each client session gets its own
 * McpServer + transport (so elicitation and responses stay per-session);
 * all sessions share the one stateless AtlassianClient.
 */
export async function startHttpServer(
  client: AtlassianClient,
  opts: HttpOptions = httpOptionsFromEnv()
): Promise<HttpServerHandle> {
  const sessions = new Map<string, Session>();
  let allowedHosts = new Set<string>();
  let allowedOrigins = new Set<string>();

  async function handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    if (new URL(req.url ?? "/", "http://localhost").pathname !== opts.path) {
      return sendError(res, 404, -32000, "Not found");
    }
    if (!allowedHosts.has(req.headers.host ?? "")) {
      return sendError(res, 403, -32000, "Forbidden: invalid Host header");
    }
    const origin = req.headers.origin;
    if (origin && !allowedOrigins.has(origin)) {
      return sendError(res, 403, -32000, "Forbidden: invalid Origin header");
    }

    let body: unknown;
    if (req.method === "POST") {
      const contentType = (req.headers["content-type"] ?? "").split(";")[0].trim().toLowerCase();
      if (contentType !== "application/json") {
        req.resume();
        return sendError(res, 415, -32000, "Unsupported Media Type: expected application/json");
      }
      const contentLength = Number(req.headers["content-length"]);
      if (Number.isFinite(contentLength) && contentLength > MAX_BODY_BYTES) {
        req.resume();
        return sendError(res, 413, -32000, "Payload too large");
      }
      try {
        body = await readJsonCapped(req, MAX_BODY_BYTES);
      } catch (err) {
        if (err instanceof PayloadTooLargeError) {
          return sendError(res, 413, -32000, "Payload too large");
        }
        return sendError(res, 400, -32700, "Parse error");
      }
    }

    const sessionId = req.headers["mcp-session-id"];
    if (typeof sessionId === "string") {
      const session = sessions.get(sessionId);
      if (!session) return sendError(res, 404, -32001, "Session not found");
      session.lastActivity = Date.now();
      session.openRequests++;
      res.on("close", () => {
        session.openRequests--;
        session.lastActivity = Date.now();
      });
      return session.transport.handleRequest(req, res, body);
    }

    if (req.method !== "POST" || !isInitializeRequest(body)) {
      return sendError(res, 400, -32000, "Bad Request: No valid session ID provided");
    }

    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => randomUUID(),
      onsessioninitialized: (id) => {
        sessions.set(id, { transport, lastActivity: Date.now(), openRequests: 0 });
      },
    });
    // Must be set before connect(): Protocol.connect() chains onto an existing onclose.
    // Fires on DELETE (SDK calls close()), idle sweep, and shutdown.
    transport.onclose = () => {
      if (transport.sessionId) sessions.delete(transport.sessionId);
    };
    await createServer(client).connect(transport);
    await transport.handleRequest(req, res, body);
  }

  const httpServer = createHttpServer((req, res) => {
    handle(req, res).catch((error) => {
      console.error("jc-mcp http error:", error);
      if (!res.headersSent) sendError(res, 500, -32603, "Internal error");
    });
  });

  await new Promise<void>((resolve, reject) => {
    httpServer.once("error", reject);
    httpServer.listen(opts.port, opts.host, () => {
      httpServer.off("error", reject);
      resolve();
    });
  });

  const address = httpServer.address() as AddressInfo;
  if (UNSPECIFIED_ADDRESSES.includes(address.address)) {
    await new Promise<void>((resolve) => httpServer.close(() => resolve()));
    throw new Error(
      `Invalid JCM_HTTP_HOST: ${opts.host} resolved to a wildcard bind (${address.address}); use a specific loopback or host address`
    );
  }
  const port = address.port;
  allowedHosts = allowedHostsFor(opts.host, address.address, port);
  allowedOrigins = new Set([...allowedHosts].map((h) => `http://${h}`));
  if (!LOOPBACK.includes(opts.host)) {
    console.error(
      `jc-mcp: warning: binding to non-loopback host ${opts.host}; this transport has no auth and is meant for trusted local use only`
    );
  }

  // ponytail: coarse timer-based reclaim, not true liveness detection. A client that
  // crashes/loses network without a clean FIN leaves its GET stream's `openRequests`
  // count stuck above 0 forever, so it would never be swept on the normal cutoff alone.
  // Force-reclaim any session (open stream or not) past HARD_IDLE_MULTIPLIER× the
  // timeout. Upgrade to TCP keepalive / app-level ping-pong if 4x proves too slow.
  const HARD_IDLE_MULTIPLIER = 4;

  const sweep = setInterval(() => {
    const now = Date.now();
    const cutoff = now - opts.idleTimeoutMs;
    const hardCutoff = now - opts.idleTimeoutMs * HARD_IDLE_MULTIPLIER;
    for (const session of [...sessions.values()]) {
      const idle =
        session.openRequests === 0 ? session.lastActivity < cutoff : session.lastActivity < hardCutoff;
      if (idle) {
        session.transport.close().catch((err) => console.error("jc-mcp: error closing idle session:", err));
      }
    }
  }, Math.min(opts.idleTimeoutMs, 60_000));
  sweep.unref();

  return {
    port,
    url: `http://${bracket(opts.host)}:${port}${opts.path}`,
    sessionCount: () => sessions.size,
    async close() {
      clearInterval(sweep);
      await Promise.all(
        [...sessions.values()].map((s) =>
          s.transport.close().catch((err) => console.error("jc-mcp: error closing session:", err))
        )
      );
      sessions.clear();
      httpServer.closeAllConnections();
      await new Promise<void>((resolve, reject) =>
        httpServer.close((err) => (err ? reject(err) : resolve()))
      );
    },
  };
}
