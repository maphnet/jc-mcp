import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { RequestId } from "@modelcontextprotocol/sdk/types.js";
import { AtlassianClient } from "../client.js";
import { confirmWrite } from "../elicitation.js";

const issueKey = z.string().regex(/^[A-Z][A-Z0-9_]+-\d+$/);

const inputSchema = z.object({
  issueKeys: z
    .array(issueKey)
    .min(1)
    .max(1000)
    .describe("Jira issue keys to convert, all in the same project, e.g. ['PROJ-2', 'PROJ-3']"),
  issueTypeName: z.string().describe("Target issue type name, e.g. 'Sub-task' or 'Task'"),
  parentKey: issueKey
    .optional()
    .describe("Parent issue key when converting to a sub-task. Omit when converting to a standalone issue type."),
});

type Input = z.infer<typeof inputSchema>;

interface BulkTask {
  status: string;
  failedAccessibleIssues?: Record<string, string[]>;
  invalidOrInaccessibleIssueCount?: number;
}

const POLL_MS = 1000;
const POLL_TIMEOUT_MS = 30000;
const PENDING = new Set(["ENQUEUED", "RUNNING", "CANCEL_REQUESTED"]);

const project = (key: string) => key.split("-")[0];

// Jira rejects issuetype/parent edits across hierarchy levels (Task <-> Sub-task)
// via PUT /issue, so conversion goes through the async bulk move API.
export async function handleConvertIssueType(
  client: AtlassianClient,
  params: Input,
  server?: McpServer,
  requestId?: RequestId
): Promise<string> {
  const { issueKeys, issueTypeName, parentKey } = params;
  const projectKey = project(issueKeys[0]);

  if ([...issueKeys, parentKey ?? issueKeys[0]].some((k) => project(k) !== projectKey)) {
    throw new Error("All issues and the parent must be in the same project.");
  }

  const { issueTypes } = await client.jiraGet<{ issueTypes: { id: string; name: string }[] }>(
    `/rest/api/3/project/${projectKey}`
  );
  const type = issueTypes.find((t) => t.name.toLowerCase() === issueTypeName.toLowerCase());
  if (!type) {
    throw new Error(
      `Issue type "${issueTypeName}" not found in ${projectKey}. Available: ${issueTypes.map((t) => t.name).join(", ")}`
    );
  }

  if (server) {
    const summary = `Convert ${issueKeys.join(", ")} to ${type.name}${parentKey ? ` under ${parentKey}` : ""}`;
    const { confirmed } = await confirmWrite(server, "Convert Issue Type", summary, requestId);
    if (!confirmed) {
      return JSON.stringify({ ok: false, keys: issueKeys, message: "Issue type not converted — write declined by user." });
    }
  }

  const target = [projectKey, type.id, parentKey].filter(Boolean).join(",");
  const { taskId } = await client.jiraPost<{ taskId: string }>("/rest/api/3/bulk/issues/move", {
    sendBulkNotification: false,
    targetToSourcesMapping: {
      [target]: {
        issueIdsOrKeys: issueKeys,
        inferFieldDefaults: true,
        inferStatusDefaults: true,
        inferSubtaskTypeDefault: true,
        inferClassificationDefaults: true,
      },
    },
  });

  let task: BulkTask = { status: "ENQUEUED" };
  for (let waited = 0; PENDING.has(task.status) && waited < POLL_TIMEOUT_MS; waited += POLL_MS) {
    await new Promise((resolve) => setTimeout(resolve, POLL_MS));
    task = await client.jiraGet<BulkTask>(`/rest/api/3/bulk/queue/${taskId}`);
  }

  const failed = task.failedAccessibleIssues ?? {};
  const invalid = task.invalidOrInaccessibleIssueCount ?? 0;
  if (task.status !== "COMPLETE" || Object.keys(failed).length > 0 || invalid > 0) {
    return JSON.stringify({
      ok: false,
      taskId,
      status: task.status,
      ...(Object.keys(failed).length > 0 && { failed }),
      ...(invalid > 0 && { invalidOrInaccessibleIssueCount: invalid }),
    });
  }

  return JSON.stringify({
    ok: true,
    keys: issueKeys,
    issueType: type.name,
    parentKey: parentKey ?? null,
  });
}

export function register(server: McpServer, client: AtlassianClient): void {
  server.registerTool(
    "jcm_convertIssueType",
    {
      title: "Convert Jira Issue Type",
      description:
        "Convert one or more Jira issues (same project) to another issue type, keeping their keys. To make tasks sub-tasks, provide parentKey. To make sub-tasks standalone, omit parentKey. Uses Jira's bulk move and waits up to 30s. Returns {ok, keys, issueType, parentKey}, or {ok:false, taskId, status, failed?} if the move failed or is still running.",
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
        {
          type: "text" as const,
          text: await handleConvertIssueType(client, params, server, extra.requestId),
        },
      ],
    })
  );
}
