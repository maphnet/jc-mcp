import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { AtlassianClient } from "../client.js";

const inputSchema = z.object({
  issueKey: z.string().regex(/^[A-Z][A-Z0-9_]+-\d+$/).describe("Jira issue key of the source issue; gets the outward verb (e.g. \"blocks\"), e.g. PROJ-123"),
  targetIssueKey: z.string().regex(/^[A-Z][A-Z0-9_]+-\d+$/).describe("Jira issue key of the target issue; gets the inward verb (e.g. \"is blocked by\"), e.g. PROJ-456"),
  linkType: z.string().describe("Link type name, e.g. \"Blocks\", \"Relates\", \"Cloners\", \"Duplicate\"."),
});

type Input = z.infer<typeof inputSchema>;

export async function handleAddIssueLink(
  client: AtlassianClient,
  params: Input
): Promise<string> {
  await client.jiraPostNoContent("/rest/api/3/issueLink", {
    type: { name: params.linkType },
    inwardIssue: { key: params.issueKey },
    outwardIssue: { key: params.targetIssueKey },
  });

  return JSON.stringify({
    ok: true,
    issueKey: params.issueKey,
    targetKey: params.targetIssueKey,
    linkType: params.linkType,
  });
}

export function register(server: McpServer, client: AtlassianClient): void {
  server.registerTool(
    "jcm_addIssueLink",
    {
      title: "Add Jira Issue Link",
      description:
        "Create a link between two Jira issues. issueKey is the source and gets the outward verb (e.g. \"blocks\", \"duplicates\", \"clones\"); targetIssueKey gets the inward verb. Returns {ok, issueKey, targetKey, linkType}.",
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
        { type: "text" as const, text: await handleAddIssueLink(client, params) },
      ],
    })
  );
}
