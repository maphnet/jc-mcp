import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { AtlassianClient } from "../client.js";
import type { LeanSearchResult } from "../types.js";

const SEARCH_FIELDS = "summary,status,assignee";

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

  const issues: LeanSearchResult[] = (raw.issues ?? []).map((issue: any) => ({
    key: issue.key,
    summary: issue.fields?.summary ?? "",
    status: issue.fields?.status?.name ?? "",
    assignee: issue.fields?.assignee?.displayName ?? null,
  }));

  return JSON.stringify({ total: raw.total, issues });
}

export function register(server: McpServer, client: AtlassianClient): void {
  server.registerTool(
    "jcm_searchIssues",
    {
      title: "Search Jira Issues",
      description:
        "Search Jira issues using JQL. Returns lean results: [{key, summary, status, assignee}].",
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
