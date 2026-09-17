import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { AtlassianClient } from "../client.js";

const inputSchema = z.object({
  spaceKey: z.string().min(1).describe("Confluence space key"),
});

type Input = z.infer<typeof inputSchema>;

export async function handleLookupSpace(
  client: AtlassianClient,
  params: Input
): Promise<string> {
  const raw = await client.confluenceGet<Record<string, any>>(
    "/wiki/api/v2/spaces",
    { keys: params.spaceKey, limit: "1" }
  );
  const matched = (raw.results ?? []).find(
    (space: any) => space.key === params.spaceKey
  );

  if (!matched) {
    throw new Error(`Confluence space not found for key: ${params.spaceKey}`);
  }

  return JSON.stringify({
    id: matched.id ?? "",
    key: matched.key ?? "",
    name: matched.name ?? "",
  });
}

export function register(server: McpServer, client: AtlassianClient): void {
  server.registerTool(
    "jcm_lookupSpace",
    {
      title: "Lookup Confluence Space",
      description:
        "Resolve a Confluence space key to its numeric ID for use with jcm_createArticle. Returns {id, key, name}.",
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
        { type: "text" as const, text: await handleLookupSpace(client, params) },
      ],
    })
  );
}
