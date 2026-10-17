import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { AtlassianClient } from "../client.js";
import type { LeanChangelogEntry } from "../types.js";

// Endpoint default and max; the scan is oldest-first, so big pages mean fewer requests.
const PAGE_SIZE = "100";

const inputSchema = z.object({
  issueKey: z.string().regex(/^[A-Z][A-Z0-9_]+-\d+$/).describe("Jira issue key, e.g. PROJ-123"),
  since: z
    .string()
    .optional()
    .describe("ISO-8601 timestamp; only entries created strictly after it (e.g. the last returned `created`)"),
  maxResults: z
    .number()
    .int()
    .min(1)
    .max(50)
    .default(20)
    .optional()
    .describe("Max entries to return (default 20, max 50)"),
});

type Input = z.infer<typeof inputSchema>;

interface RawChangelogPage {
  values?: any[];
  isLast?: boolean;
  total?: number;
}

function toEntry(v: any): LeanChangelogEntry {
  return {
    id: v.id,
    authorAccountId: v.author?.accountId ?? null,
    author: v.author?.displayName ?? "Unknown",
    created: v.created,
    items: (v.items ?? []).map((i: any) => ({
      field: i.field,
      from: i.fromString ?? null,
      // A missing `toString` key resolves to Object.prototype.toString; accept strings only.
      to: typeof i.toString === "string" ? i.toString : null,
    })),
  };
}

export async function handleGetIssueChangelog(
  client: AtlassianClient,
  params: Input
): Promise<string> {
  const sinceMs = params.since === undefined ? null : Date.parse(params.since);
  if (Number.isNaN(sinceMs)) {
    throw new Error("Invalid 'since': expected ISO-8601 timestamp, e.g. 2026-08-10T14:30:00Z");
  }
  const max = params.maxResults ?? 20;
  const entries: LeanChangelogEntry[] = [];

  // ponytail: always scans from startAt=0 (the endpoint has no time filter or reverse order); fine until issues carry thousands of changes.
  for (let startAt = 0; ; ) {
    const page = await client.jiraGet<RawChangelogPage>(
      `/rest/api/3/issue/${params.issueKey}/changelog`,
      { startAt: String(startAt), maxResults: PAGE_SIZE }
    );
    const values = page.values ?? [];
    for (const v of values) {
      if (sinceMs !== null && Date.parse(v.created) <= sinceMs) continue;
      // Never cut inside a group sharing one `created`, or a strict `since` resume would skip the rest.
      if (entries.length >= max && Date.parse(v.created) !== Date.parse(entries[entries.length - 1].created)) {
        return JSON.stringify({ entries, truncated: true });
      }
      entries.push(toEntry(v));
    }
    startAt += values.length;
    // Fallbacks guard against an endless loop if isLast is absent.
    if (page.isLast === true || values.length === 0 || (page.total !== undefined && startAt >= page.total)) {
      break;
    }
  }

  return JSON.stringify({ entries, truncated: false });
}

export function register(server: McpServer, client: AtlassianClient): void {
  server.registerTool(
    "jcm_getIssueChangelog",
    {
      title: "Get Jira Issue Changelog",
      description:
        "Get a Jira issue's field-change history, oldest first. Returns {entries: [{id, authorAccountId, author, created, items: [{field, from, to}]}], truncated}. `since` keeps entries created strictly after it. Capped at maxResults oldest matches (entries sharing the last timestamp stay together); if truncated, call again with since = last returned created.",
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
        { type: "text" as const, text: await handleGetIssueChangelog(client, params) },
      ],
    })
  );
}
