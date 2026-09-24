import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { AtlassianClient } from "../../src/client.js";
import type { Config } from "../../src/config.js";

const testConfig: Config = {
  siteUrl: "https://test.atlassian.net",
  email: "user@test.com",
  apiToken: "test-token",
  cloudId: "test-cloud-id",
};

describe("jcm_searchArticles", () => {
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

  it("searches with CQL and returns lean results", async () => {
    fetchSpy.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          results: [
            {
              content: {
                id: "111",
                title: "Setup Guide",
                type: "page",
              },
              resultGlobalContainer: { title: "Knowledge Base", displayUrl: "/spaces/KB" },
              lastModified: "2026-08-10T10:00:00.000Z",
            },
            {
              content: {
                id: "222",
                title: "FAQ",
                type: "page",
              },
              resultGlobalContainer: { title: "Knowledge Base", displayUrl: "/spaces/KB" },
              lastModified: "2026-08-09T15:00:00.000Z",
            },
          ],
          totalSize: 2,
        }),
    });

    const { handleSearchArticles } = await import(
      "../../src/tools/search-articles.js"
    );
    const result = await handleSearchArticles(client, {
      cql: 'space = "KB" AND type = "page" AND text ~ "setup"',
    });

    const parsed = JSON.parse(result);
    expect(parsed.total).toBe(2);
    expect(parsed.articles).toEqual([
      {
        id: "111",
        title: "Setup Guide",
        space: "Knowledge Base",
        spaceKey: "KB",
        lastModified: "2026-08-10T10:00:00.000Z",
      },
      {
        id: "222",
        title: "FAQ",
        space: "Knowledge Base",
        spaceKey: "KB",
        lastModified: "2026-08-09T15:00:00.000Z",
      },
    ]);
  });
});
