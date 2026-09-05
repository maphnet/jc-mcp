import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { AtlassianClient } from "../client.js";
import { markdownToAdf } from "../markdown-to-adf.js";
import { confirmWrite } from "../elicitation.js";

const inputSchema = z.object({
  issueKey: z.string().regex(/^[A-Z][A-Z0-9_]+-\d+$/).describe("Jira issue key, e.g. PROJ-123"),
  fields: z
    .record(z.unknown())
    .describe(
      "Fields to update as {fieldName: value}. Example: {summary: 'New title', labels: ['bug']}"
    ),
});

type Input = z.infer<typeof inputSchema>;

export async function handleEditIssue(
  client: AtlassianClient,
  params: Input,
  server?: McpServer
): Promise<string> {
  if (server) {
    const fieldNames = Object.keys(params.fields).join(", ");
    const summary = `Edit ${params.issueKey}: update fields [${fieldNames}]`;
    const { confirmed } = await confirmWrite(server, "Edit Jira Issue", summary);
    if (!confirmed) {
      return JSON.stringify({ ok: false, key: params.issueKey, message: "Issue not changed — write declined by user." });
    }
  }

  const fields = { ...params.fields };
  if (typeof fields.description === "string") {
    fields.description = markdownToAdf(fields.description);
  }

  await client.jiraPut(`/rest/api/3/issue/${params.issueKey}`, {
    fields,
  });

  return JSON.stringify({ ok: true, key: params.issueKey });
}

export function register(server: McpServer, client: AtlassianClient): void {
  server.registerTool(
    "jcm_editIssue",
    {
      title: "Edit Jira Issue",
      description:
        "Update fields on a Jira issue. Pass fields as {fieldName: value}. Description field accepts markdown. Returns {ok, key}.",
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
        { type: "text" as const, text: await handleEditIssue(client, params, server) },
      ],
    })
  );
}
