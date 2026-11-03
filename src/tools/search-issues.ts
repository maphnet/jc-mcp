import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { AtlassianClient } from "../client.js";
import type { LeanSearchResult } from "../types.js";
import { toLeanParent } from "../lean-parent.js";

const SEARCH_FIELDS = "summary,status,assignee,updated,issuetype,parent";

const inputSchema = z.object({
  jql: z.string().describe("JQL query string"),
  maxResults: z
    .number()
    .int()
    .min(1)
    .max(50)
    .default(20)
    .optional()
    .describe("Max results to return (default 20, max 50)"),
});

type Input = z.infer<typeof inputSchema>;

export async function handleSearchIssues(
  client: AtlassianClient,
  params: Input
): Promise<string> {
  const queryParams: Record<string, string> = {
    jql: params.jql,
    fields: SEARCH_FIELDS,
    maxResults: String(params.maxResults ?? 20),
  };

  const raw = await client.jiraGet<{
    issues: any[];
    total: number;
  }>("/rest/api/3/search/jql", queryParams);

  // Search silently returns zero results for invalid values; surface them.
  // A failing parse call propagates as a tool error (no fallback).
  if (!raw.issues?.length) {
    const parsed = await client.jiraPost<{
      queries?: { errors?: string[] }[];
    }>("/rest/api/3/jql/parse?validation=strict", { queries: [params.jql] });
    const errors = parsed.queries?.[0]?.errors ?? [];
    if (errors.length) throw new Error(`Invalid JQL: ${errors.join("; ")}`);
  }

  // toJqlDate caches the /myself promise synchronously, so this is one lookup.
  const issues: LeanSearchResult[] = await Promise.all(
    (raw.issues ?? []).map(async (issue: any) => {
      const updated: string = issue.fields?.updated ?? "";
      return {
        key: issue.key,
        summary: issue.fields?.summary ?? "",
        status: issue.fields?.status?.name ?? "",
        type: issue.fields?.issuetype?.name ?? "",
        parent: toLeanParent(issue.fields?.parent),
        assignee: issue.fields?.assignee?.displayName ?? null,
        updated,
        updatedJql: await client.toJqlDate(updated),
      };
    })
  );

  return JSON.stringify({ total: raw.total, issues });
}

export function register(server: McpServer, client: AtlassianClient): void {
  server.registerTool(
    "jcm_searchIssues",
    {
      title: "Search Jira Issues",
      description:
        "Search Jira issues using JQL. Returns {total, issues: [{key, summary, status, type, parent, assignee, updated, updatedJql}]}. parent is {key, summary, type} or null. updatedJql is the issue's updated time floored to the minute in your Jira timezone; poll with `key = X AND updated > \"<updatedJql>\"` (at-least-once, dedupe). Zero results are validated: invalid JQL values (unknown issue type, missing parent, etc.) return an error instead of an empty list.",
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
        { type: "text" as const, text: await handleSearchIssues(client, params) },
      ],
    })
  );
}
