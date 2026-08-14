import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { AtlassianClient } from "../client.js";
import type { LeanUser } from "../types.js";

const inputSchema = z.object({
  email: z.string().email().describe("Email address of the user to look up"),
});

type Input = z.infer<typeof inputSchema>;

export async function handleLookupUser(
  client: AtlassianClient,
  params: Input
): Promise<string> {
  const raw = await client.jiraGet<any[]>("/rest/api/3/user/search", {
    query: params.email,
  });

  const users: LeanUser[] = (raw ?? []).map((u: any) => ({
    accountId: u.accountId ?? "",
    displayName: u.displayName ?? "",
    email: u.emailAddress ?? "",
    active: u.active ?? false,
  }));

  return JSON.stringify(users);
}

export function register(server: McpServer, client: AtlassianClient): void {
  server.registerTool(
    "jcm_lookupUser",
    {
      title: "Lookup User",
      description:
        "Look up a Jira user by email address. Returns [{accountId, displayName, email, active}].",
      inputSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async (params: Input) => ({
      content: [
        { type: "text" as const, text: await handleLookupUser(client, params) },
      ],
    })
  );
}
