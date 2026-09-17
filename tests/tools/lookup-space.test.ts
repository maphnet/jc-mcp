import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { AtlassianClient } from "../../src/client.js";
import type { Config } from "../../src/config.js";

const testConfig: Config = {
  siteUrl: "https://test.atlassian.net",
  email: "user@test.com",
  apiToken: "test-token",
  cloudId: "test-cloud-id",
};

describe("jcm_lookupSpace", () => {
  let fetchSpy: ReturnType<typeof vi.fn>;
  let client: AtlassianClient;

  beforeEach(() => {
    fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    client = new AtlassianClient(testConfig);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns the matching lean space and sends the exact lookup request", async () => {
    fetchSpy.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          results: [{ id: "123456", key: "VPS-1", name: "VPS One" }],
        }),
    });

    const { handleLookupSpace } = await import(
      "../../src/tools/lookup-space.js"
    );
    const result = await handleLookupSpace(client, { spaceKey: "VPS-1" });

    expect(JSON.parse(result)).toEqual({
      id: "123456",
      key: "VPS-1",
      name: "VPS One",
    });
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(fetchSpy).toHaveBeenCalledWith(
      "https://test.atlassian.net/wiki/api/v2/spaces?keys=VPS-1&limit=1",
      expect.objectContaining({ method: "GET" })
    );
  });

  it("rejects when the returned space key does not exactly match", async () => {
    fetchSpy.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          results: [{ id: "123456", key: "VPS-10", name: "VPS Ten" }],
        }),
    });

    const { handleLookupSpace } = await import(
      "../../src/tools/lookup-space.js"
    );

    await expect(handleLookupSpace(client, { spaceKey: "VPS-1" })).rejects.toThrow(
      "Confluence space not found for key: VPS-1"
    );
  });

  it("rejects when no spaces are returned", async () => {
    fetchSpy.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ results: [] }),
    });

    const { handleLookupSpace } = await import(
      "../../src/tools/lookup-space.js"
    );

    await expect(handleLookupSpace(client, { spaceKey: "VPS-1" })).rejects.toThrow(
      "Confluence space not found for key: VPS-1"
    );
  });

  it("registers a validated read-only lookup tool", async () => {
    const registerTool = vi.fn();
    const server = { registerTool };
    const { register } = await import("../../src/tools/lookup-space.js");

    register(server as any, client);

    expect(registerTool).toHaveBeenCalledTimes(1);
    const [name, definition] = registerTool.mock.calls[0];
    expect(name).toBe("jcm_lookupSpace");
    expect(definition.annotations).toEqual({
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    });
    expect(definition.inputSchema.safeParse({ spaceKey: "VPS-1" }).success).toBe(
      true
    );
    expect(definition.inputSchema.safeParse({ spaceKey: "" }).success).toBe(
      false
    );
  });
});
