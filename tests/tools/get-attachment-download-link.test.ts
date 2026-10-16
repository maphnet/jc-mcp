import { describe, expect, it, vi } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { AtlassianClient } from "../../src/client.js";
import { register } from "../../src/tools/get-attachment-download-link.js";

describe("jcm_getAttachmentDownloadLink", () => {
  it("exposes a read-only tool, returns the link, and validates IDs at the MCP boundary", async () => {
    const result = { attachmentId: "10001", filename: "report.pdf", url: "https://api.media.atlassian.com/file/abc/binary?token=test", temporary: true };
    const resolver = vi.fn().mockResolvedValue(result);
    const server = new McpServer({ name: "test", version: "0.0.0" });
    register(server, { jiraGetAttachmentDownloadLink: resolver } as unknown as AtlassianClient);
    const client = new Client({ name: "test-client", version: "0.0.0" });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await server.connect(serverTransport);
    await client.connect(clientTransport);
    try {
      const { tools } = await client.listTools();
      expect(tools[0].name).toBe("jcm_getAttachmentDownloadLink");
      expect(tools[0].annotations?.readOnlyHint).toBe(true);
      expect(await client.callTool({ name: tools[0].name, arguments: { attachmentId: "10001" } })).toMatchObject({
        content: [{ type: "text", text: JSON.stringify(result) }],
      });
      const invalid = await client.callTool({ name: tools[0].name, arguments: { attachmentId: "../10001" } });
      expect(invalid.isError).toBe(true);
      expect(resolver).toHaveBeenCalledExactlyOnceWith("10001");
    } finally {
      await client.close();
      await server.close();
    }
  });
});
