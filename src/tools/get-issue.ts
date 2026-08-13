import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { AtlassianClient } from "../client.js";
import { adfToMarkdown } from "../adf-to-markdown.js";
import type { LeanIssue, LeanComment } from "../types.js";

const ISSUE_FIELDS = [
  "summary",
  "description",
  "status",
  "issuetype",
  "priority",
  "assignee",
  "labels",
  "comment",
].join(",");

const inputSchema = z.object({
  issueKey: z.string().regex(/^[A-Z][A-Z0-9_]+-\d+$/).describe("Jira issue key, e.g. PROJ-123"),
});

type Input = z.infer<typeof inputSchema>;

export async function handleGetIssue(
  client: AtlassianClient,
  params: Input
): Promise<string> {
  const raw = await client.jiraGet<Record<string, any>>(
    `/rest/api/3/issue/${params.issueKey}`,
    { fields: ISSUE_FIELDS }
  );

  const fields = raw.fields ?? {};

  const comments: LeanComment[] = (
    fields.comment?.comments ?? []
  ).map((c: any) => ({
    author: c.author?.displayName ?? "Unknown",
    body: c.body ? adfToMarkdown(c.body) : "",
    created: c.created ?? "",
  }));

  const lean: LeanIssue = {
    key: raw.key,
    summary: fields.summary ?? "",
    description: fields.description
      ? adfToMarkdown(fields.description)
      : null,
    status: fields.status?.name ?? "",
    type: fields.issuetype?.name ?? "",
    priority: fields.priority?.name ?? "",
    assignee: fields.assignee?.displayName ?? null,
    labels: fields.labels ?? [],
    comments,
  };

  return JSON.stringify(lean);
}

export function register(server: McpServer, client: AtlassianClient): void {
  server.registerTool(
    "jcm_getIssue",
    {
      title: "Get Jira Issue",
      description:
        "Fetch a Jira issue by key. Returns lean fields: key, summary, description (markdown), status, type, priority, assignee, labels, comments.",
      inputSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async (params: Input) => ({
      content: [{ type: "text" as const, text: await handleGetIssue(client, params) }],
    })
  );
}
