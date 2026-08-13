import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { AtlassianClient } from "../client.js";

const inputSchema = z.object({
  issueKey: z.string().regex(/^[A-Z][A-Z0-9_]+-\d+$/).describe("Jira issue key, e.g. PROJ-123"),
  transitionId: z
    .string()
    .regex(/^\d+$/)
    .describe("Transition ID from jcm_getTransitions"),
});

type Input = z.infer<typeof inputSchema>;

export async function handleTransitionIssue(
  client: AtlassianClient,
  params: Input
): Promise<string> {
  await client.jiraPostNoContent(
    `/rest/api/3/issue/${params.issueKey}/transitions`,
    { transition: { id: params.transitionId } }
  );

  return JSON.stringify({
    ok: true,
    key: params.issueKey,
    transitionId: params.transitionId,
  });
}

export function register(server: McpServer, client: AtlassianClient): void {
  server.registerTool(
    "jcm_transitionIssue",
    {
      title: "Transition Jira Issue",
      description:
        "Move a Jira issue to a new workflow state. Use jcm_getTransitions first to get valid transition IDs. Returns {ok, key, transitionId}.",
      inputSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: false,
        openWorldHint: true,
      },
    },
    async (params: Input) => ({
      content: [
        {
          type: "text" as const,
          text: await handleTransitionIssue(client, params),
        },
      ],
    })
  );
}
