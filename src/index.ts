#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { loadConfig } from "./config.js";
import { AtlassianClient } from "./client.js";
import { register as registerGetIssue } from "./tools/get-issue.js";
import { register as registerGetTransitions } from "./tools/get-transitions.js";
import { register as registerEditIssue } from "./tools/edit-issue.js";
import { register as registerTransitionIssue } from "./tools/transition-issue.js";
import { register as registerCreateIssue } from "./tools/create-issue.js";
import { register as registerAddComment } from "./tools/add-comment.js";
import { register as registerSearchIssues } from "./tools/search-issues.js";
import { register as registerGetArticle } from "./tools/get-article.js";
import { register as registerCreateArticle } from "./tools/create-article.js";
import { register as registerUpdateArticle } from "./tools/update-article.js";
import { register as registerSearchArticles } from "./tools/search-articles.js";
import { register as registerCreateVersion } from "./tools/create-version.js";
import { register as registerListVersions } from "./tools/list-versions.js";
import { register as registerReleaseVersion } from "./tools/release-version.js";

async function main(): Promise<void> {
  const config = await loadConfig();
  const client = new AtlassianClient(config);

  const server = new McpServer({
    name: "jc-mcp",
    version: "0.1.0",
  });

  // Priority 1 tools
  registerGetIssue(server, client);
  registerGetTransitions(server, client);
  registerEditIssue(server, client);
  registerTransitionIssue(server, client);

  // Priority 2 tools
  registerCreateIssue(server, client);
  registerAddComment(server, client);
  registerSearchIssues(server, client);

  // Version management tools
  registerCreateVersion(server, client);
  registerListVersions(server, client);
  registerReleaseVersion(server, client);

  // Priority 3 tools (Confluence)
  registerGetArticle(server, client);
  registerCreateArticle(server, client);
  registerUpdateArticle(server, client);
  registerSearchArticles(server, client);

  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("jc-mcp server running via stdio");
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
