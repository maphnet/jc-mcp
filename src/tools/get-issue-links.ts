import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { AtlassianClient } from "../client.js";

const inputSchema = z.object({
  issueKey: z.string().regex(/^[A-Z][A-Z0-9_]+-\d+$/).describe("Jira issue key, e.g. PROJ-123"),
});

type Input = z.infer<typeof inputSchema>;

interface RawIssueLink {
  id: string;
  type: { name: string; inward: string; outward: string };
  inwardIssue?: { key: string };
  outwardIssue?: { key: string };
}

interface RawResponse {
  fields: {
    issuelinks: RawIssueLink[];
  };
}

export async function handleGetIssueLinks(
  client: AtlassianClient,
  params: Input
): Promise<string> {
  const raw = await client.jiraGet<RawResponse>(
    `/rest/api/3/issue/${params.issueKey}`,
    { fields: "issuelinks" }
  );

  const links = raw.fields.issuelinks.map((link) => ({
    id: link.id,
    type: link.type.name,
    ...(link.inwardIssue ? { inwardIssue: link.inwardIssue.key } : {}),
    ...(link.outwardIssue ? { outwardIssue: link.outwardIssue.key } : {}),
  }));

  return JSON.stringify(links);
}

export function register(server: McpServer, client: AtlassianClient): void {
  server.registerTool(
    "jcm_getIssueLinks",
    {
      title: "Get Jira Issue Links",
      description:
        "Get all links for a Jira issue. Returns flat array of [{id, type, inwardIssue?, outwardIssue?}].",
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
        { type: "text" as const, text: await handleGetIssueLinks(client, params) },
      ],
    })
  );
}
