import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { AtlassianClient } from "../../src/client.js";
import type { Config } from "../../src/config.js";

const testConfig: Config = {
  siteUrl: "https://test.atlassian.net",
  email: "user@test.com",
  apiToken: "test-token",
  cloudId: "test-cloud-id",
};

describe("jcm_updateArticle", () => {
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

  it("updates page and returns confirmation with new version", async () => {
    fetchSpy.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          id: "12345",
          title: "Updated Article",
          version: { number: 4 },
        }),
    });

    const { handleUpdateArticle } = await import(
      "../../src/tools/update-article.js"
    );
    const result = await handleUpdateArticle(client, {
      pageId: "12345",
      title: "Updated Article",
      body: "Updated content",
      version: 3,
    });

    const parsed = JSON.parse(result);
    expect(parsed).toEqual({ ok: true, id: "12345", version: 4 });

    // Verify PUT body includes incremented version
    const [, opts] = fetchSpy.mock.calls[0];
    const body = JSON.parse(opts.body);
    expect(body.version.number).toBe(4);
    expect(body.title).toBe("Updated Article");
  });
});
