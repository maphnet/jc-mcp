import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { AtlassianClient } from "../client.js";

const inputSchema = z.object({
  attachmentId: z.string().regex(/^[0-9]+$/).describe("Numeric attachment ID from jcm_getIssue attachments"),
});

type Input = z.infer<typeof inputSchema>;

export async function handleGetAttachmentDownloadLink(client: AtlassianClient, params: Input): Promise<string> {
  return JSON.stringify(await client.jiraGetAttachmentDownloadLink(params.attachmentId));
}

export function register(server: McpServer, client: AtlassianClient): void {
  server.registerTool(
    "jcm_getAttachmentDownloadLink",
    {
      title: "Get Jira Attachment Download Link",
      description: "Resolve an attachment ID from jcm_getIssue to {attachmentId, filename, url, temporary: true}. Requires the server's Jira account to have permission to view the attachment. Download the sensitive temporary URL without Jira credentials using a local download tool; request a fresh URL after expiry. File bytes are not returned. Supports Jira Cloud's Atlassian media redirects.",
      inputSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async (params: Input) => ({
      content: [{ type: "text" as const, text: await handleGetAttachmentDownloadLink(client, params) }],
    })
  );
}
