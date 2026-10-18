import { describe, it, expect } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import type { AtlassianClient } from "../src/client.js";
import { createServer } from "../src/server.js";

describe("createServer", () => {
  it("registers every jc-mcp tool on a fresh McpServer", async () => {
    const server = createServer({} as AtlassianClient);
    const client = new Client({ name: "test", version: "0.0.0" });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await server.connect(serverTransport);
    await client.connect(clientTransport);

    const { tools } = await client.listTools();
    const names = tools.map((t) => t.name);

    expect(names).toHaveLength(24);
    expect(names).toContain("jcm_getIssue");
    expect(names).toContain("jcm_addToActiveSprint");
    expect(names).toContain("jcm_getIssueChangelog");
    expect(names).toContain("jcm_getAttachmentDownloadLink");
    expect(names).toContain("jcm_editIssue");
    expect(names).toContain("jcm_lookupSpace");

    await client.close();
  });

  it("returns a distinct server per call", () => {
    const client = {} as AtlassianClient;
    expect(createServer(client)).not.toBe(createServer(client));
  });
});
