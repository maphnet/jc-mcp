import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { AtlassianClient } from "../client.js";
import type { LeanArticleSearchResult } from "../types.js";

const inputSchema = z.object({
  cql: z
    .string()
    .describe(
      'Confluence Query Language string. Example: space = "KB" AND type = "page" AND text ~ "search term"'
    ),
  maxResults: z
    .number()
    .int()
    .min(1)
    .max(25)
    .default(10)
    .optional()
    .describe("Max results (default 10, max 25)"),
});

type Input = z.infer<typeof inputSchema>;

export async function handleSearchArticles(
  client: AtlassianClient,
  params: Input
): Promise<string> {
  const raw = await client.confluenceGet<Record<string, any>>(
    "/wiki/rest/api/search",
    {
      cql: params.cql,
      limit: String(params.maxResults ?? 10),
    }
  );

  const articles: LeanArticleSearchResult[] = (raw.results ?? []).map(
    (r: any) => ({
      id: r.content?.id ?? "",
      title: r.content?.title ?? "",
      space: r.resultGlobalContainer?.title ?? "",
      spaceKey:
        r.resultGlobalContainer?.displayUrl?.match(/\/spaces\/([^/]+)/)?.[1] ?? "",
      lastModified: r.lastModified ?? "",
    })
  );

  return JSON.stringify({ total: raw.totalSize ?? articles.length, articles });
}

export function register(server: McpServer, client: AtlassianClient): void {
  server.registerTool(
    "jcm_searchArticles",
    {
      title: "Search Confluence Articles",
      description:
        "Search Confluence pages using CQL. Returns [{id, title, space, spaceKey, lastModified}].",
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
        {
          type: "text" as const,
          text: await handleSearchArticles(client, params),
        },
      ],
    })
  );
}
