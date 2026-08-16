import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { AtlassianClient } from "../client.js";
import { markdownToAdf } from "../markdown-to-adf.js";

const inputSchema = z.object({
  projectKey: z.string().regex(/^[A-Z][A-Z0-9_]+$/).describe("Project key, e.g. PROJ"),
  issueType: z.string().describe("Issue type name, e.g. Task, Bug, Story"),
  summary: z.string().describe("Issue summary/title"),
  description: z
    .string()
    .optional()
    .describe("Description (supports markdown formatting)"),
  parentKey: z
    .string()
    .optional()
    .describe("Parent issue key for sub-tasks, e.g. PROJ-1"),
});

type Input = z.infer<typeof inputSchema>;

export async function handleCreateIssue(
  client: AtlassianClient,
  params: Input
): Promise<string> {
  const fields: Record<string, unknown> = {
    project: { key: params.projectKey },
    issuetype: { name: params.issueType },
    summary: params.summary,
  };

  if (params.description) {
    fields.description = markdownToAdf(params.description);
  }

  if (params.parentKey) {
    fields.parent = { key: params.parentKey };
  }

  const raw = await client.jiraPost<{ id: string; key: string; self: string }>(
    "/rest/api/3/issue",
    { fields }
  );

  const siteUrl = client.getSiteUrl();
  return JSON.stringify({
    key: raw.key,
    url: `${siteUrl}/browse/${raw.key}`,
  });
}

export function register(server: McpServer, client: AtlassianClient): void {
  server.registerTool(
    "jcm_createIssue",
    {
      title: "Create Jira Issue",
      description:
        "Create a new Jira issue. Returns {key, url}. For sub-tasks, pass parentKey.",
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
        { type: "text" as const, text: await handleCreateIssue(client, params) },
      ],
    })
  );
}
