import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { AtlassianClient } from "../client.js";

const inputSchema = z.object({
  linkId: z.string().regex(/^\d+$/).describe("Issue link ID (from jcm_getIssueLinks)"),
});

type Input = z.infer<typeof inputSchema>;

export async function handleRemoveIssueLink(
  client: AtlassianClient,
  params: Input
): Promise<string> {
  await client.jiraDelete(`/rest/api/3/issueLink/${params.linkId}`);

  return JSON.stringify({ ok: true, linkId: params.linkId });
}

export function register(server: McpServer, client: AtlassianClient): void {
  server.registerTool(
    "jcm_removeIssueLink",
    {
      title: "Remove Jira Issue Link",
      description:
        "Delete an issue link by its ID. Use jcm_getIssueLinks to find link IDs. Returns {ok, linkId}.",
      inputSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async (params: Input) => ({
      content: [
        { type: "text" as const, text: await handleRemoveIssueLink(client, params) },
      ],
    })
  );
}
