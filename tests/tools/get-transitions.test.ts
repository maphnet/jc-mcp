import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { AtlassianClient } from "../../src/client.js";
import type { Config } from "../../src/config.js";

const testConfig: Config = {
  siteUrl: "https://test.atlassian.net",
  email: "user@test.com",
  apiToken: "test-token",
  cloudId: "test-cloud-id",
};

const jiraTransitionsResponse = {
  expand: "transitions",
  transitions: [
    {
      id: "11",
      name: "To Do",
      to: {
        self: "https://...",
        description: "",
        iconUrl: "https://...",
        name: "To Do",
        id: "10000",
        statusCategory: { self: "https://...", id: 2, key: "new", name: "To Do" },
      },
      hasScreen: false,
      isGlobal: true,
      isInitial: false,
      isConditional: false,
      isLooped: false,
    },
    {
      id: "21",
      name: "In Progress",
      to: {
        self: "https://...",
        description: "",
        iconUrl: "https://...",
        name: "In Progress",
        id: "3",
        statusCategory: { self: "https://...", id: 4, key: "indeterminate", name: "In Progress" },
      },
      hasScreen: false,
      isGlobal: true,
      isInitial: false,
      isConditional: false,
      isLooped: false,
    },
    {
      id: "31",
      name: "Done",
      to: {
        self: "https://...",
        description: "",
        iconUrl: "https://...",
        name: "Done",
        id: "10001",
        statusCategory: { self: "https://...", id: 3, key: "done", name: "Done" },
      },
      hasScreen: false,
      isGlobal: false,
      isInitial: false,
      isConditional: false,
      isLooped: false,
    },
  ],
};

describe("jcm_getTransitions", () => {
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

  it("returns only id and name for each transition", async () => {
    fetchSpy.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(jiraTransitionsResponse),
    });

    const { handleGetTransitions } = await import(
      "../../src/tools/get-transitions.js"
    );
    const result = await handleGetTransitions(client, { issueKey: "TEST-1" });
    const parsed = JSON.parse(result);

    expect(parsed).toEqual([
      { id: "11", name: "To Do" },
      { id: "21", name: "In Progress" },
      { id: "31", name: "Done" },
    ]);

    // Verify no bloat
    const resultStr = result;
    expect(resultStr).not.toContain("statusCategory");
    expect(resultStr).not.toContain("iconUrl");
    expect(resultStr).not.toContain("hasScreen");
  });
});
