#!/usr/bin/env node

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { loadConfig, ConfigError } from "./config.js";
import { AtlassianClient } from "./client.js";
import { createServer } from "./server.js";

async function main(): Promise<void> {
  const config = await loadConfig();
  const client = new AtlassianClient(config);

  if (process.env.JCM_TRANSPORT === "http") {
    // Dynamic import keeps the stdio path from loading any HTTP code.
    const { startHttpServer } = await import("./http-transport.js");
    const handle = await startHttpServer(client);
    console.error(`jc-mcp server running via http at ${handle.url}`);
    const shutdown = () => {
      handle.close().finally(() => process.exit(0));
    };
    process.once("SIGINT", shutdown);
    process.once("SIGTERM", shutdown);
    return;
  }

  const server = createServer(client);
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("jc-mcp server running via stdio");
}

main().catch((error) => {
  if (error instanceof ConfigError) {
    console.error(error.message);
  } else {
    console.error("Fatal error:", error);
  }
  process.exit(1);
});
