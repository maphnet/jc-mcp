import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { AtlassianClient } from "../../src/client.js";
import type { Config } from "../../src/config.js";

const testConfig: Config = {
  siteUrl: "https://test.atlassian.net",
  email: "user@test.com",
  apiToken: "test-token",
  cloudId: "test-cloud-id",
};

describe("jcm_searchIssues", () => {
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

  it("searches with JQL and returns lean results", async () => {
    fetchSpy.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          issues: [
            {
              key: "TEST-1",
              fields: {
                summary: "First issue",
                status: { name: "Open" },
                assignee: { displayName: "Alice" },
              },
            },
            {
              key: "TEST-2",
              fields: {
                summary: "Second issue",
                status: { name: "Done" },
                assignee: null,
              },
            },
          ],
          total: 2,
          maxResults: 50,
        }),
    });

    const { handleSearchIssues } = await import(
      "../../src/tools/search-issues.js"
    );
    const result = await handleSearchIssues(client, {
      jql: 'project = TEST AND status = "Open"',
    });

    const parsed = JSON.parse(result);
    expect(parsed.total).toBe(2);
    expect(parsed.issues).toEqual([
      { key: "TEST-1", summary: "First issue", status: "Open", assignee: "Alice" },
      { key: "TEST-2", summary: "Second issue", status: "Done", assignee: null },
    ]);

    // Verify it used the /search/jql endpoint with selective fields
    const [url] = fetchSpy.mock.calls[0];
    expect(url).toContain("/rest/api/3/search/jql");
    expect(url).toContain("fields=summary");
  });

  it("supports maxResults parameter", async () => {
    fetchSpy.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({ issues: [], total: 0, maxResults: 10 }),
    });

    const { handleSearchIssues } = await import(
      "../../src/tools/search-issues.js"
    );
    await handleSearchIssues(client, {
      jql: "project = TEST",
      maxResults: 10,
    });

    const [url] = fetchSpy.mock.calls[0];
    expect(url).toContain("maxResults=10");
  });
});
