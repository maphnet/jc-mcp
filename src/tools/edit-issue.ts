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

// Single-line, bounded, control/bidi/zero-width-free text for the confirmation dialog.
function clean(s: string, max = 200): string {
  s = s.replace(/[\u0000-\u001f\u007f-\u009f\u2028\u2029]+/g, " ").replace(/[\u200b-\u200f\u202a-\u202e\u2066-\u2069\ufeff]/g, "");
  return s.length > max ? `${s.slice(0, max)}…` : s;
}

function preview(v: unknown): string {
  let s: string;
  try {
    s = JSON.stringify(v) ?? String(v);
  } catch {
    s = String(v);
  }
  return clean(s);
}

function describeUpdate(update: Record<string, unknown>): string[] {
  return Object.entries(update).flatMap(([rawField, ops]) => {
    const field = clean(rawField, 100);
    if (!Array.isArray(ops)) return [`${field}: ${preview(ops)}`];
    if (ops.length === 0) return [`${field}: []`];
    return ops.map((op) => {
      if (op && typeof op === "object" && !Array.isArray(op)) {
        const entries = Object.entries(op);
        if (entries.length === 0) return `${field}: {}`;
        return entries.map(([verb, val]) => `${field}:${clean(verb, 100)} ${preview(val)}`).join("; ");
      }
      return `${field}: ${preview(op)}`;
    });
  });
}

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
    if (hasFields) parts.push(`update fields [${Object.entries(params.fields!).map(([k, v]) => `${clean(k, 100)}=${preview(v)}`).join("; ")}]`);
    if (hasUpdate) parts.push(`apply update ops [${describeUpdate(params.update!).join("; ")}]`);
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
