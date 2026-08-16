import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { AtlassianClient } from "../client.js";

const inputSchema = z.object({
  issueKey: z.string().regex(/^[A-Z][A-Z0-9_]+-\d+$/).describe("Jira issue key, e.g. PROJ-123"),
  issueTypeName: z.string().describe("Target issue type name, e.g. 'Sub-task' or 'Task'"),
  parentKey: z
    .string()
    .regex(/^[A-Z][A-Z0-9_]+-\d+$/)
    .optional()
    .describe("Parent issue key when converting to a sub-task. Omit when converting to a standalone task."),
});

type Input = z.infer<typeof inputSchema>;

export async function handleConvertIssueType(
  client: AtlassianClient,
  params: Input
): Promise<string> {
  const { issueKey, issueTypeName, parentKey } = params;
  const issuePath = `/rest/api/3/issue/${issueKey}`;

  // Fetch current state for rollback
  const current = await client.jiraGet<Record<string, any>>(issuePath, {
    fields: "issuetype,parent",
  });
  const originalTypeName: string = current.fields.issuetype.name;
  const originalParentKey: string | undefined = current.fields.parent?.key;

  if (parentKey) {
    // Validate parent is in the same project
    const issueProject = issueKey.split("-")[0];
    const parentProject = parentKey.split("-")[0];
    if (issueProject !== parentProject) {
      throw new Error(
        "Parent issue must be in the same project as the issue being converted."
      );
    }

    // Task -> Sub-task: set issuetype first, then parent
    await client.jiraPut(issuePath, {
      fields: { issuetype: { name: issueTypeName } },
    });

    try {
      await client.jiraPut(issuePath, {
        fields: { parent: { key: parentKey } },
      });
    } catch (error) {
      // Rollback: restore original issue type
      try {
        await client.jiraPut(issuePath, {
          fields: { issuetype: { name: originalTypeName } },
        });
      } catch {
        // Best-effort rollback; throw the original error
      }
      throw error;
    }
  } else {
    // Sub-task -> Task: remove parent first (if present), then set issuetype
    if (originalParentKey) {
      await client.jiraPut(issuePath, {
        fields: { parent: null },
      });
    }

    try {
      await client.jiraPut(issuePath, {
        fields: { issuetype: { name: issueTypeName } },
      });
    } catch (error) {
      // Rollback: restore original parent and issuetype
      try {
        if (originalParentKey) {
          await client.jiraPut(issuePath, {
            fields: { parent: { key: originalParentKey } },
          });
        }
        await client.jiraPut(issuePath, {
          fields: { issuetype: { name: originalTypeName } },
        });
      } catch {
        // Best-effort rollback; throw the original error
      }
      throw error;
    }
  }

  return JSON.stringify({
    ok: true,
    key: issueKey,
    issueType: issueTypeName,
    parentKey: parentKey ?? null,
  });
}

export function register(server: McpServer, client: AtlassianClient): void {
  server.registerTool(
    "jcm_convertIssueType",
    {
      title: "Convert Jira Issue Type",
      description:
        "Convert a Jira issue's type using a two-step process. To make a task a sub-task, provide parentKey. To make a sub-task standalone, omit parentKey. Returns {ok, key, issueType, parentKey}.",
      inputSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: false,
        openWorldHint: true,
      },
    },
    async (params: Input) => ({
      content: [
        {
          type: "text" as const,
          text: await handleConvertIssueType(client, params),
        },
      ],
    })
  );
}
