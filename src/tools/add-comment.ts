import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { AtlassianClient } from "../client.js";

const inputSchema = z.object({
  issueKey: z.string().regex(/^[A-Z][A-Z0-9_]+-\d+$/).describe("Jira issue key, e.g. PROJ-123"),
  body: z.string().describe("Comment text (plain text, converted to ADF)"),
});

type Input = z.infer<typeof inputSchema>;

export async function handleAddComment(
  client: AtlassianClient,
  params: Input
): Promise<string> {
  const adfBody = {
    type: "doc",
    version: 1,
    content: [
      {
        type: "paragraph",
        content: [{ type: "text", text: params.body }],
      },
    ],
  };

  const raw = await client.jiraPost<{ id: string }>(
    `/rest/api/3/issue/${params.issueKey}/comment`,
    { body: adfBody }
  );

  return JSON.stringify({ ok: true, commentId: raw.id });
}

export function register(server: McpServer, client: AtlassianClient): void {
  server.registerTool(
    "jcm_addComment",
    {
      title: "Add Comment to Jira Issue",
      description:
        "Add a comment to a Jira issue. Pass plain text body. Returns {ok, commentId}.",
      inputSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
    },
    async (params: Input) => ({
      content: [
        { type: "text" as const, text: await handleAddComment(client, params) },
      ],
    })
  );
}
