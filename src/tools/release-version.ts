import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { AtlassianClient } from "../client.js";

const inputSchema = z.object({
  versionId: z.string().regex(/^\d+$/).describe("Jira version ID (numeric)"),
  releaseDate: z.string().optional().describe("Release date (YYYY-MM-DD). Defaults to today."),
});

type Input = z.infer<typeof inputSchema>;

interface JiraVersion {
  id: string;
  name: string;
  released: boolean;
}

export async function handleReleaseVersion(
  client: AtlassianClient,
  params: Input
): Promise<string> {
  const releaseDate =
    params.releaseDate ?? new Date().toISOString().split("T")[0];

  const raw = await client.jiraPutJson<JiraVersion>(
    `/rest/api/3/version/${params.versionId}`,
    { released: true, releaseDate }
  );

  return JSON.stringify({ ok: true, id: raw.id, name: raw.name });
}

export function register(server: McpServer, client: AtlassianClient): void {
  server.registerTool(
    "jcm_releaseVersion",
    {
      title: "Release Jira Version",
      description:
        "Mark a Jira version as released. Returns {ok, id, name}.",
      inputSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async (params: Input) => ({
      content: [
        { type: "text" as const, text: await handleReleaseVersion(client, params) },
      ],
    })
  );
}
