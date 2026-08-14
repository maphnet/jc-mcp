import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { AtlassianClient } from "../client.js";
import type { LeanUser } from "../types.js";

export async function handleGetCurrentUser(
  client: AtlassianClient
): Promise<string> {
  const raw = await client.jiraGet<Record<string, any>>(
    "/rest/api/3/myself"
  );

  const lean: LeanUser = {
    accountId: raw.accountId ?? "",
    displayName: raw.displayName ?? "",
    email: raw.emailAddress ?? "",
    active: raw.active ?? false,
  };

  return JSON.stringify(lean);
}

export function register(server: McpServer, client: AtlassianClient): void {
  server.registerTool(
    "jcm_getCurrentUser",
    {
      title: "Get Current User",
      description:
        "Returns the authenticated Atlassian user's account info: accountId, displayName, email, active.",
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async () => ({
      content: [
        { type: "text" as const, text: await handleGetCurrentUser(client) },
      ],
    })
  );
}
