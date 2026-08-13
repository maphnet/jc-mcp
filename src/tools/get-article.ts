import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { AtlassianClient } from "../client.js";
import { storageToMarkdown } from "../adf-to-markdown.js";
import type { LeanArticle } from "../types.js";

const inputSchema = z.object({
  pageId: z.string().regex(/^\d+$/).describe("Confluence page ID"),
});

type Input = z.infer<typeof inputSchema>;

export async function handleGetArticle(
  client: AtlassianClient,
  params: Input
): Promise<string> {
  const raw = await client.confluenceGet<Record<string, any>>(
    `/wiki/api/v2/pages/${params.pageId}`,
    { "body-format": "storage" }
  );

  const lean: LeanArticle = {
    id: raw.id,
    title: raw.title ?? "",
    body: storageToMarkdown(raw.body?.storage?.value ?? ""),
    status: raw.status ?? "",
    version: raw.version?.number ?? 0,
  };

  return JSON.stringify(lean);
}

export function register(server: McpServer, client: AtlassianClient): void {
  server.registerTool(
    "jcm_getArticle",
    {
      title: "Get Confluence Article",
      description:
        "Fetch a Confluence page by ID. Returns {id, title, body (markdown), status, version}.",
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
        { type: "text" as const, text: await handleGetArticle(client, params) },
      ],
    })
  );
}
