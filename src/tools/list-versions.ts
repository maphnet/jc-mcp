import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { AtlassianClient } from "../client.js";

const inputSchema = z.object({
  projectKey: z.string().regex(/^[A-Z][A-Z0-9_]+$/).describe("Jira project key, e.g. PROJ"),
});

type Input = z.infer<typeof inputSchema>;

interface JiraVersion {
  id: string;
  name: string;
  released: boolean;
  releaseDate?: string;
}

export async function handleListVersions(
  client: AtlassianClient,
  params: Input
): Promise<string> {
  const raw = await client.jiraGet<JiraVersion[]>(
    `/rest/api/3/project/${params.projectKey}/versions`
  );

  const lean = raw.map((v) => ({
    id: v.id,
    name: v.name,
    released: v.released,
    releaseDate: v.releaseDate ?? null,
  }));

  return JSON.stringify(lean);
}

export function register(server: McpServer, client: AtlassianClient): void {
  server.registerTool(
    "jcm_listVersions",
    {
      title: "List Jira Versions",
      description:
        "List all versions in a Jira project. Returns [{id, name, released, releaseDate}].",
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
        { type: "text" as const, text: await handleListVersions(client, params) },
      ],
    })
  );
}
