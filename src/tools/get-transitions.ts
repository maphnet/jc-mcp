import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { AtlassianClient } from "../client.js";
import type { LeanTransition } from "../types.js";

const inputSchema = z.object({
  issueKey: z.string().regex(/^[A-Z][A-Z0-9_]+-\d+$/).describe("Jira issue key, e.g. PROJ-123"),
});

type Input = z.infer<typeof inputSchema>;

export async function handleGetTransitions(
  client: AtlassianClient,
  params: Input
): Promise<string> {
  const raw = await client.jiraGet<{ transitions: any[] }>(
    `/rest/api/3/issue/${params.issueKey}/transitions`
  );

  const lean: LeanTransition[] = (raw.transitions ?? []).map((t: any) => ({
    id: t.id,
    name: t.name,
  }));

  return JSON.stringify(lean);
}

export function register(server: McpServer, client: AtlassianClient): void {
  server.registerTool(
    "jcm_getTransitions",
    {
      title: "Get Issue Transitions",
      description:
        "Get available workflow transitions for a Jira issue. Returns [{id, name}].",
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
        { type: "text" as const, text: await handleGetTransitions(client, params) },
      ],
    })
  );
}
