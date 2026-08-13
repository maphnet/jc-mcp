import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { AtlassianClient } from "../../src/client.js";
import type { Config } from "../../src/config.js";

const testConfig: Config = {
  siteUrl: "https://test.atlassian.net",
  email: "user@test.com",
  apiToken: "test-token",
  cloudId: "test-cloud-id",
};

describe("jcm_getArticle", () => {
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

  it("returns lean article with stripped HTML body", async () => {
    fetchSpy.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          id: "12345",
          title: "Getting Started",
          status: "current",
          version: { number: 3 },
          body: {
            storage: {
              value: "<p>This is the <strong>article</strong> body.</p>",
            },
          },
          _links: { webui: "/spaces/KB/pages/12345" },
        }),
    });

    const { handleGetArticle } = await import(
      "../../src/tools/get-article.js"
    );
    const result = await handleGetArticle(client, { pageId: "12345" });
    const parsed = JSON.parse(result);

    expect(parsed.id).toBe("12345");
    expect(parsed.title).toBe("Getting Started");
    expect(parsed.body).toBe("This is the **article** body.");
    expect(parsed.status).toBe("current");
    expect(parsed.version).toBe(3);
  });
});
