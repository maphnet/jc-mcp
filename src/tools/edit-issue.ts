import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { RequestId } from "@modelcontextprotocol/sdk/types.js";
import { AtlassianClient } from "../client.js";
import { markdownToAdf } from "../markdown-to-adf.js";
import { confirmWrite } from "../elicitation.js";

const inputSchema = z.object({
  issueKey: z.string().regex(/^[A-Z][A-Z0-9_]+-\d+$/).describe("Jira issue key, e.g. PROJ-123"),
  fields: z
    .record(z.unknown())
    .optional()
    .describe(
      "Fields to set as {fieldName: value}. Example: {summary: 'New title', labels: ['bug']}"
    ),
  update: z
    .record(z.unknown())
    .optional()
    .describe(
      "Incremental operations as {fieldName: [{op: value}]}, passed verbatim to Jira (no markdown conversion). Example: {fixVersions: [{add: {name: '1.2.0'}}]}"
    ),
});

type Input = z.infer<typeof inputSchema>;

export async function handleEditIssue(
  client: AtlassianClient,
  params: Input,
  server?: McpServer,
  requestId?: RequestId
): Promise<string> {
  const hasFields = !!params.fields && Object.keys(params.fields).length > 0;
  const hasUpdate = !!params.update && Object.keys(params.update).length > 0;
  if (!hasFields && !hasUpdate) {
    throw new Error("jcm_editIssue requires a non-empty 'fields' or 'update'.");
  }

  if (server) {
    const parts: string[] = [];
    if (hasFields) parts.push(`update fields [${Object.keys(params.fields!).join(", ")}]`);
    if (hasUpdate) parts.push(`apply update ops [${Object.keys(params.update!).join(", ")}]`);
    const summary = `Edit ${params.issueKey}: ${parts.join("; ")}`;
    const { confirmed } = await confirmWrite(server, "Edit Jira Issue", summary, requestId);
    if (!confirmed) {
      return JSON.stringify({ ok: false, key: params.issueKey, message: "Issue not changed — write declined by user." });
    }
  }

  const body: Record<string, unknown> = {};
  if (hasFields) {
    const fields = { ...params.fields };
    if (typeof fields.description === "string") {
      fields.description = markdownToAdf(fields.description);
    }
    body.fields = fields;
  }
  if (hasUpdate) body.update = params.update;

  await client.jiraPut(`/rest/api/3/issue/${params.issueKey}`, body);

  return JSON.stringify({ ok: true, key: params.issueKey });
}

export function register(server: McpServer, client: AtlassianClient): void {
  server.registerTool(
    "jcm_editIssue",
    {
      title: "Edit Jira Issue",
      description:
        "Update a Jira issue. Pass 'fields' as {fieldName: value} to set values (description accepts markdown), and/or 'update' for incremental ops like adding a fix version: update={fixVersions: [{add: {name: '1.2.0'}}]}. 'update' values are passed verbatim, not markdown-converted. At least one is required. Returns {ok, key}.",
      inputSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async (params: Input, extra) => ({
      content: [
        { type: "text" as const, text: await handleEditIssue(client, params, server, extra.requestId) },
      ],
    })
  );
}
