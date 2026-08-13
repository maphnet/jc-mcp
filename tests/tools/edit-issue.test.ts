import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { AtlassianClient } from "../../src/client.js";
import type { Config } from "../../src/config.js";

const testConfig: Config = {
  siteUrl: "https://test.atlassian.net",
  email: "user@test.com",
  apiToken: "test-token",
  cloudId: "test-cloud-id",
};

describe("jcm_editIssue", () => {
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

  it("sends PUT and returns minimal confirmation", async () => {
    fetchSpy.mockResolvedValueOnce({ ok: true, status: 204 });

    const { handleEditIssue } = await import("../../src/tools/edit-issue.js");
    const result = await handleEditIssue(client, {
      issueKey: "TEST-1",
      fields: { summary: "Updated title", labels: ["urgent"] },
    });

    const parsed = JSON.parse(result);
    expect(parsed).toEqual({ ok: true, key: "TEST-1" });

    // Verify it called PUT with correct body
    const [url, opts] = fetchSpy.mock.calls[0];
    expect(url).toContain("/rest/api/3/issue/TEST-1");
    expect(opts.method).toBe("PUT");
    expect(JSON.parse(opts.body)).toEqual({
      fields: { summary: "Updated title", labels: ["urgent"] },
    });
  });
});
