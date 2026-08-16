import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { AtlassianClient } from "../client.js";

const inputSchema = z.object({
  issueKey: z.string().regex(/^[A-Z][A-Z0-9_]+-\d+$/).describe("Jira issue key for the source (outward) issue, e.g. PROJ-123"),
  targetIssueKey: z.string().regex(/^[A-Z][A-Z0-9_]+-\d+$/).describe("Jira issue key for the target (inward) issue, e.g. PROJ-456"),
  linkType: z.string().describe("Link type name, e.g. \"Blocks\", \"Relates\", \"Cloners\", \"Duplicate\". The source issue is the outward side (e.g. \"blocks\") and the target is the inward side (e.g. \"is blocked by\")"),
});

type Input = z.infer<typeof inputSchema>;

export async function handleAddIssueLink(
  client: AtlassianClient,
  params: Input
): Promise<string> {
  await client.jiraPostNoContent("/rest/api/3/issueLink", {
    type: { name: params.linkType },
    outwardIssue: { key: params.issueKey },
    inwardIssue: { key: params.targetIssueKey },
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
        "Create a link between two Jira issues. The issueKey is the outward side and targetIssueKey is the inward side of the relationship. Returns {ok, issueKey, targetKey, linkType}.",
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
