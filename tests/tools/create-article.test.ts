import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { AtlassianClient } from "../../src/client.js";
import type { Config } from "../../src/config.js";

const testConfig: Config = {
  siteUrl: "https://test.atlassian.net",
  email: "user@test.com",
  apiToken: "test-token",
  cloudId: "test-cloud-id",
};

describe("jcm_createArticle", () => {
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

  it("creates page and returns id, title, url", async () => {
    fetchSpy.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          id: "67890",
          title: "New Article",
          _links: { webui: "/spaces/KB/pages/67890/New+Article" },
        }),
    });

    const { handleCreateArticle } = await import(
      "../../src/tools/create-article.js"
    );
    const result = await handleCreateArticle(client, {
      spaceId: "123456",
      title: "New Article",
      body: "Article content here",
    });

    const parsed = JSON.parse(result);
    expect(parsed.id).toBe("67890");
    expect(parsed.title).toBe("New Article");
    expect(parsed.url).toContain("/spaces/KB/pages/67890");
  });

  it("converts markdown body to XHTML storage format", async () => {
    fetchSpy.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          id: "67891",
          title: "MD Article",
          _links: { webui: "/spaces/KB/pages/67891" },
        }),
    });

    const { handleCreateArticle } = await import(
      "../../src/tools/create-article.js"
    );
    await handleCreateArticle(client, {
      spaceId: "123456",
      title: "MD Article",
      body: "## Introduction\n\nSome **bold** text",
    });

    const [, opts] = fetchSpy.mock.calls[0];
    const reqBody = JSON.parse(opts.body);
    expect(reqBody.body.value).toContain("<h2>");
    expect(reqBody.body.value).toContain("<strong>bold</strong>");
    expect(reqBody.body.representation).toBe("storage");
  });
});
