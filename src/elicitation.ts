import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { RequestId } from "@modelcontextprotocol/sdk/types.js";

/**
 * Whether write-tool elicitation gating is enabled.
 * When `JCM_CONFIRM_WRITES=true`, each gated write tool presents a
 * confirmation form (MCP `elicitation/create`, mode "form") before
 * executing the write. The user sees the draft and can accept, decline,
 * or let it time out. Without the flag (or any other value), writes
 * proceed immediately — existing behaviour is unchanged.
 */
export function isConfirmWritesEnabled(): boolean {
  return process.env.JCM_CONFIRM_WRITES === "true";
}

export interface ConfirmWriteResult {
  confirmed: boolean;
}

/**
 * Presents a confirmation elicitation form to the user before a write
 * operation. Returns `{ confirmed: true }` only when the user explicitly
 * accepts. Decline, cancel, and timeout all return `{ confirmed: false }`.
 *
 * If `JCM_CONFIRM_WRITES` is not `"true"`, returns `{ confirmed: true }`
 * immediately (gate is a no-op).
 *
 * @param server  The McpServer instance (elicitation lives on `server.server`)
 * @param title   Short title shown in the confirmation dialog
 * @param summary Human-readable summary of what will be written
 * @param relatedRequestId The triggering tools/call request id; under
 *   Streamable HTTP this sends the prompt on that request's SSE stream
 *   instead of the optional standalone GET stream (which may not be open)
 */
export async function confirmWrite(
  server: McpServer,
  title: string,
  summary: string,
  relatedRequestId?: RequestId
): Promise<ConfirmWriteResult> {
  if (!isConfirmWritesEnabled()) {
    return { confirmed: true };
  }

  try {
    const result = await server.server.elicitInput(
      {
        mode: "form",
        message: `${title}\n\n${summary}`,
        requestedSchema: {
          type: "object",
          properties: {
            confirm: {
              type: "boolean",
              title: "Confirm",
              description: "Approve this write operation?",
              default: false,
            },
          },
          required: ["confirm"],
        },
      },
      { relatedRequestId }
    );

    if (result.action === "accept" && result.content?.confirm === true) {
      return { confirmed: true };
    }

    return { confirmed: false };
  } catch {
    // If elicitation is not supported by the client, or any error occurs,
    // treat it as declined to be safe.
    return { confirmed: false };
  }
}
