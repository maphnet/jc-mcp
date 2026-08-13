import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { AtlassianClient } from "../client.js";

const inputSchema = z.object({
  spaceId: z.string().regex(/^\d+$/).describe("Confluence space ID"),
  title: z.string().describe("Page title"),
  body: z
    .string()
    .describe("Page body content (plain text or HTML)"),
  parentId: z
    .string()
    .regex(/^\d+$/)
    .optional()
    .describe("Parent page ID (optional)"),
});

type Input = z.infer<typeof inputSchema>;

export async function handleCreateArticle(
  client: AtlassianClient,
  params: Input
): Promise<string> {
  const requestBody: Record<string, unknown> = {
    spaceId: params.spaceId,
    title: params.title,
    status: "current",
    body: {
      representation: "storage",
      value: params.body,
    },
  };

  if (params.parentId) {
    requestBody.parentId = params.parentId;
  }

  const raw = await client.confluencePost<Record<string, any>>(
    "/wiki/api/v2/pages",
    requestBody
  );

  const siteUrl = client.getSiteUrl();
  return JSON.stringify({
    id: raw.id,
    title: raw.title ?? "",
    url: `${siteUrl}/wiki${raw._links?.webui ?? `/pages/${raw.id}`}`,
  });
}

export function register(server: McpServer, client: AtlassianClient): void {
  server.registerTool(
    "jcm_createArticle",
    {
      title: "Create Confluence Article",
      description:
        "Create a new Confluence page. Returns {id, title, url}.",
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
        {
          type: "text" as const,
          text: await handleCreateArticle(client, params),
        },
      ],
    })
  );
}
