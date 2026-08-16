import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { AtlassianClient } from "../client.js";
import { markdownToStorage } from "../markdown-to-adf.js";

const inputSchema = z.object({
  pageId: z.string().regex(/^\d+$/).describe("Confluence page ID"),
  title: z.string().describe("Page title (required for updates)"),
  body: z.string().describe("Updated page body content (supports markdown formatting)"),
  version: z
    .number()
    .int()
    .describe("Current version number (from jcm_getArticle). Will be incremented automatically."),
});

type Input = z.infer<typeof inputSchema>;

export async function handleUpdateArticle(
  client: AtlassianClient,
  params: Input
): Promise<string> {
  const raw = await client.confluencePut<Record<string, any>>(
    `/wiki/api/v2/pages/${params.pageId}`,
    {
      id: params.pageId,
      title: params.title,
      status: "current",
      version: { number: params.version + 1 },
      body: {
        representation: "storage",
        value: markdownToStorage(params.body),
      },
    }
  );

  return JSON.stringify({
    ok: true,
    id: raw.id,
    version: raw.version?.number ?? params.version + 1,
  });
}

export function register(server: McpServer, client: AtlassianClient): void {
  server.registerTool(
    "jcm_updateArticle",
    {
      title: "Update Confluence Article",
      description:
        "Update a Confluence page. Pass current version number (auto-incremented). Returns {ok, id, version}.",
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
        {
          type: "text" as const,
          text: await handleUpdateArticle(client, params),
        },
      ],
    })
  );
}
