import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { AtlassianClient } from "../../src/client.js";
import type { Config } from "../../src/config.js";

const testConfig: Config = {
  siteUrl: "https://test.atlassian.net",
  email: "user@test.com",
  apiToken: "test-token",
  cloudId: "test-cloud-id",
};

describe("jcm_transitionIssue", () => {
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

  it("posts transition and returns confirmation with new status", async () => {
    // First call: POST transition (204 No Content)
    fetchSpy.mockResolvedValueOnce({ ok: true, status: 204 });

    const { handleTransitionIssue } = await import(
      "../../src/tools/transition-issue.js"
    );
    const result = await handleTransitionIssue(client, {
      issueKey: "TEST-1",
      transitionId: "31",
    });

    const parsed = JSON.parse(result);
    expect(parsed).toEqual({ ok: true, key: "TEST-1", transitionId: "31" });

    const [url, opts] = fetchSpy.mock.calls[0];
    expect(url).toContain("/rest/api/3/issue/TEST-1/transitions");
    expect(opts.method).toBe("POST");
    expect(JSON.parse(opts.body)).toEqual({ transition: { id: "31" } });
  });
});
