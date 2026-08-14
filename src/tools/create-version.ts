import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { AtlassianClient } from "../client.js";

const inputSchema = z.object({
  projectKey: z.string().regex(/^[A-Z][A-Z0-9_]+$/).describe("Jira project key, e.g. PROJ"),
  name: z.string().describe("Version name, e.g. '1.0.0'"),
  description: z.string().optional().describe("Version description"),
  releaseDate: z.string().optional().describe("Target release date (YYYY-MM-DD)"),
});

type Input = z.infer<typeof inputSchema>;

interface JiraVersion {
  id: string;
  name: string;
  self: string;
}

export async function handleCreateVersion(
  client: AtlassianClient,
  params: Input
): Promise<string> {
  const body: Record<string, unknown> = {
    name: params.name,
    project: params.projectKey,
  };
  if (params.description) body.description = params.description;
  if (params.releaseDate) body.releaseDate = params.releaseDate;

  const raw = await client.jiraPost<JiraVersion>("/rest/api/3/version", body);

  return JSON.stringify({ id: raw.id, name: raw.name });
}

export function register(server: McpServer, client: AtlassianClient): void {
  server.registerTool(
    "jcm_createVersion",
    {
      title: "Create Jira Version",
      description:
        "Create a new version (release) in a Jira project. Returns {id, name}.",
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
        { type: "text" as const, text: await handleCreateVersion(client, params) },
      ],
    })
  );
}
