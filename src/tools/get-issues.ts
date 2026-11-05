import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { AtlassianClient } from "../client.js";
import { adfToMarkdown } from "../adf-to-markdown.js";
import { toLeanParent } from "../lean-parent.js";

const MAX_COMMENTS = 3;
const DEFAULT_DESCRIPTION_CHARS = 600;
const DEFAULT_COMMENT_CHARS = 300;
const NOT_FOUND = "not found, no access, or moved";

const inputSchema = z.object({
  issueKeys: z
    .array(z.string().regex(/^[A-Z][A-Z0-9_]+-\d+$/))
    .min(1)
    .max(50)
    .describe("Jira issue keys, e.g. [\"PROJ-1\", \"PROJ-2\"] (max 50; duplicates collapsed)"),
  fields: z
    .array(z.enum(["description", "comments"]))
    .min(1)
    .optional()
    .describe("Which content to include (default both). key, summary, type, status, parent are always returned"),
  maxDescriptionChars: z
    .number()
    .int()
    .min(1)
    .max(20000)
    .optional()
    .describe(`Description cap in chars (default ${DEFAULT_DESCRIPTION_CHARS})`),
  maxCommentChars: z
    .number()
    .int()
    .min(1)
    .max(20000)
    .optional()
    .describe(`Per-comment body cap in chars (default ${DEFAULT_COMMENT_CHARS})`),
});

type Input = z.infer<typeof inputSchema>;

function cap(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max)}… [truncated, ${text.length} chars total]` : text;
}

export async function handleGetIssues(
  client: AtlassianClient,
  params: Input
): Promise<string> {
  const keys = [...new Set(params.issueKeys)];
  const want = new Set(params.fields ?? ["description", "comments"]);
  const maxDescription = params.maxDescriptionChars ?? DEFAULT_DESCRIPTION_CHARS;
  const maxComment = params.maxCommentChars ?? DEFAULT_COMMENT_CHARS;

  const fields = ["summary", "issuetype", "status", "parent"];
  if (want.has("description")) fields.push("description");
  if (want.has("comments")) fields.push("comment");

  // Keys are regex-validated, so they are safe to inline unquoted in JQL.
  // Search silently omits missing/forbidden keys (HTTP 200); errors are synthesized below.
  const byKey = new Map<string, any>();
  let nextPageToken: string | undefined;
  // Follow continuation tokens so a short page never turns found keys into "not found".
  for (let page = 0; page < 50; page++) {
    const params: Record<string, string> = {
      jql: `key in (${keys.join(", ")})`,
      fields: fields.join(","),
      maxResults: "50",
    };
    if (nextPageToken) params.nextPageToken = nextPageToken;
    const raw = await client.jiraGet<{ issues?: any[]; nextPageToken?: string }>(
      "/rest/api/3/search/jql",
      params
    );
    for (const issue of raw.issues ?? []) byKey.set(issue.key, issue);
    nextPageToken = raw.nextPageToken;
    if (!nextPageToken) break;
  }
  if (nextPageToken) throw new Error("Jira search did not finish paging; result would be incomplete");

  const entries = keys.map((key) => {
    const issue = byKey.get(key);
    if (!issue) return { key, error: NOT_FOUND };

    const f = issue.fields ?? {};
    const entry: Record<string, unknown> = {
      key,
      summary: f.summary ?? "",
      type: f.issuetype?.name ?? "",
      status: f.status?.name ?? "",
      parent: toLeanParent(f.parent),
    };

    if (want.has("description")) {
      entry.description = f.description ? cap(adfToMarkdown(f.description), maxDescription) : null;
    }

    if (want.has("comments")) {
      // Jira returns comments oldest-first; keep the most recent ones in that order.
      const all: any[] = f.comment?.comments ?? [];
      const recent = all.slice(-MAX_COMMENTS);
      entry.comments = recent.map((c: any) => ({
        author: c.author?.displayName ?? "Unknown",
        body: c.body ? cap(adfToMarkdown(c.body), maxComment) : "",
        created: c.created ?? "",
      }));
      const total: number = f.comment?.total ?? all.length;
      if (total > recent.length) entry.commentsTotal = total;
    }

    return entry;
  });

  return JSON.stringify(entries);
}

export function register(server: McpServer, client: AtlassianClient): void {
  server.registerTool(
    "jcm_getIssues",
    {
      title: "Get Jira Issues (batch)",
      description:
        `Batch-read up to 50 Jira issues in one call (one JQL search). Returns an array in request order, one entry per unique key: {key, summary, type, status, parent ({key, summary, type} or null), description (markdown or null), comments: [{author, body, created}], commentsTotal?}. fields selects description and/or comments (default both). Descriptions are capped at maxDescriptionChars (default ${DEFAULT_DESCRIPTION_CHARS}), comment bodies at maxCommentChars (default ${DEFAULT_COMMENT_CHARS}); cut text ends with "… [truncated, N chars total]". Only the ${MAX_COMMENTS} most recent comments are returned (oldest first); commentsTotal appears when more exist. A key that is missing, not visible to you, or was moved returns {key, error} instead of being dropped. Use jcm_getIssue for full detail on one issue.`,
      inputSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async (params: Input) => ({
      content: [{ type: "text" as const, text: await handleGetIssues(client, params) }],
    })
  );
}
