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
  "reporter",
  "labels",
  "updated",
  "comment",
  "attachment",
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
    id: c.id,
    author: c.author?.displayName ?? "Unknown",
    authorAccountId: c.author?.accountId ?? null,
    body: c.body ? adfToMarkdown(c.body) : "",
    created: c.created ?? "",
    updated: c.updated ?? "",
  }));

  const updated: string = fields.updated ?? "";

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
    reporter: fields.reporter
      ? { displayName: fields.reporter.displayName ?? "", accountId: fields.reporter.accountId ?? "" }
      : null,
    labels: fields.labels ?? [],
    updated,
    updatedJql: await client.toJqlDate(updated),
    comments,
    attachments: (fields.attachment ?? []).map((attachment: any) => ({
      id: attachment.id,
      filename: attachment.filename,
      mimeType: attachment.mimeType,
      size: attachment.size,
      content: attachment.content,
    })),
  };

  return JSON.stringify(lean);
}

export function register(server: McpServer, client: AtlassianClient): void {
  server.registerTool(
    "jcm_getIssue",
    {
      title: "Get Jira Issue",
      description:
        "Fetch a Jira issue by key. Returns lean fields: key, summary, description (markdown), status, type, priority, assignee, reporter ({displayName, accountId} or null), labels, updated (ISO), updatedJql (updated floored to the minute in your Jira timezone, for JQL `updated > \"...\"` polling; at-least-once, dedupe; null if unavailable), comments (id, author, authorAccountId, body, created, updated), attachments (id, filename, mimeType, size, content URL). Attachment content URLs require Jira authentication.",
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
