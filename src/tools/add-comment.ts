import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { AtlassianClient } from "../client.js";
import { markdownToAdf } from "../markdown-to-adf.js";
import { confirmWrite } from "../elicitation.js";

const inputSchema = z.object({
  issueKey: z.string().regex(/^[A-Z][A-Z0-9_]+-\d+$/).describe("Jira issue key, e.g. PROJ-123"),
  body: z.string().describe("Comment text (supports markdown formatting)"),
});

type Input = z.infer<typeof inputSchema>;

export async function handleAddComment(
  client: AtlassianClient,
  params: Input,
  server?: McpServer
): Promise<string> {
  if (server) {
    const preview = params.body.length > 200 ? params.body.slice(0, 200) + "..." : params.body;
    const summary = `Add comment to ${params.issueKey}:\n${preview}`;
    const { confirmed } = await confirmWrite(server, "Add Comment", summary);
    if (!confirmed) {
      return JSON.stringify({ ok: false, message: "Comment not added — write declined by user." });
    }
  }

  const adfBody = markdownToAdf(params.body);

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
        "Add a comment to a Jira issue. Body accepts markdown (headings, tables, code fences, lists). Returns {ok, commentId}.",
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
        { type: "text" as const, text: await handleAddComment(client, params, server) },
      ],
    })
  );
}
