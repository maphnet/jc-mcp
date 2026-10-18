import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { RequestId } from "@modelcontextprotocol/sdk/types.js";
import { AtlassianClient } from "../client.js";
import { confirmWrite } from "../elicitation.js";

const inputSchema = z.object({
  issueKey: z.string().regex(/^[A-Z][A-Z0-9_]+-\d+$/).describe("Jira issue key, e.g. PROJ-123"),
  boardId: z
    .number()
    .int()
    .positive()
    .optional()
    .describe("Scrum board ID; only needed when the project has several scrum boards"),
});

type Input = z.infer<typeof inputSchema>;

interface Named {
  id: number;
  name: string;
}

const candidates = (list: Named[]) => list.map(({ id, name }) => ({ id, name }));

export async function handleAddToActiveSprint(
  client: AtlassianClient,
  params: Input,
  server?: McpServer,
  requestId?: RequestId
): Promise<string> {
  const { issueKey } = params;

  const issue = await client.jiraGet<{ fields: { sprint?: (Named & { state?: string }) | null } }>(
    `/rest/agile/1.0/issue/${issueKey}`,
    { fields: "sprint" }
  );
  const current = issue.fields.sprint;
  if (current?.state === "active") {
    return JSON.stringify({
      ok: true,
      skipped: "already-in-sprint",
      sprint: { id: current.id, name: current.name },
    });
  }

  let boardId = params.boardId;
  if (boardId === undefined) {
    const boards = await client.jiraGet<{ values: Named[] }>("/rest/agile/1.0/board", {
      projectKeyOrId: issueKey.split("-")[0],
      type: "scrum",
    });
    if (boards.values.length === 0) {
      return JSON.stringify({ ok: true, skipped: "no-scrum-board" });
    }
    if (boards.values.length > 1) {
      return JSON.stringify({
        ok: false,
        reason: "multiple-scrum-boards",
        candidates: candidates(boards.values),
      });
    }
    boardId = boards.values[0].id;
  }

  const sprints = await client.jiraGet<{ values: Named[] }>(
    `/rest/agile/1.0/board/${boardId}/sprint`,
    { state: "active" }
  );
  if (sprints.values.length !== 1) {
    return JSON.stringify({
      ok: false,
      reason: sprints.values.length === 0 ? "no-active-sprint" : "multiple-active-sprints",
      candidates: candidates(sprints.values),
    });
  }
  const sprint = sprints.values[0];

  if (server) {
    const summary = `Add ${issueKey} to active sprint "${sprint.name}" (ID ${sprint.id})`;
    const { confirmed } = await confirmWrite(server, "Add Issue to Active Sprint", summary, requestId);
    if (!confirmed) {
      return JSON.stringify({ ok: false, key: issueKey, message: "Issue not added to sprint — write declined by user." });
    }
  }

  await client.jiraPostNoContent(`/rest/agile/1.0/sprint/${sprint.id}/issue`, { issues: [issueKey] });

  return JSON.stringify({
    ok: true,
    key: issueKey,
    sprintId: sprint.id,
    sprintName: sprint.name,
    boardId,
  });
}

export function register(server: McpServer, client: AtlassianClient): void {
  server.registerTool(
    "jcm_addToActiveSprint",
    {
      title: "Add Issue to Active Sprint",
      description:
        "Add a Jira issue to its project's active scrum sprint. No-op if the issue is already in an active sprint or the project has no scrum board. If several scrum boards or active sprints exist, returns {ok:false, reason, candidates:[{id,name}]}; retry with boardId. Returns {ok, key, sprintId, sprintName, boardId} or {ok, skipped}.",
      inputSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async (params: Input, extra) => ({
      content: [
        {
          type: "text" as const,
          text: await handleAddToActiveSprint(client, params, server, extra.requestId),
        },
      ],
    })
  );
}
