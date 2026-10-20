import { readFileSync } from "node:fs";
import { describe, it, expect } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import type { AtlassianClient } from "../src/client.js";
import { createServer } from "../src/server.js";

const readJson = (name: string) =>
  JSON.parse(readFileSync(new URL(`../${name}`, import.meta.url), "utf8"));

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

  it("reports the package.json version in serverInfo", async () => {
    const server = createServer({} as AtlassianClient);
    const client = new Client({ name: "test", version: "0.0.0" });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await server.connect(serverTransport);
    await client.connect(clientTransport);

    expect(client.getServerVersion()?.version).toBe(readJson("package.json").version);

    await client.close();
  });

  it("keeps server.json in sync with the package.json version", () => {
    expect(readJson("server.json").version_detail.version).toBe(readJson("package.json").version);
  });

  it("returns a distinct server per call", () => {
    const client = {} as AtlassianClient;
    expect(createServer(client)).not.toBe(createServer(client));
  });
});
