#!/usr/bin/env node

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { loadConfig, ConfigError } from "./config.js";
import { AtlassianClient } from "./client.js";
import { createServer } from "./server.js";

async function main(): Promise<void> {
  const config = await loadConfig();
  const client = new AtlassianClient(config);

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
