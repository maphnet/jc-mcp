import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { AtlassianClient } from "../../src/client.js";
import type { Config } from "../../src/config.js";

const testConfig: Config = {
  siteUrl: "https://test.atlassian.net",
  email: "user@test.com",
  apiToken: "test-token",
  cloudId: "test-cloud-id",
};

describe("jcm_addComment", () => {
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

  it("posts comment in ADF format and returns minimal confirmation", async () => {
    fetchSpy.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          id: "10500",
          self: "https://...",
          body: { type: "doc", version: 1, content: [] },
        }),
    });

    const { handleAddComment } = await import(
      "../../src/tools/add-comment.js"
    );
    const result = await handleAddComment(client, {
      issueKey: "TEST-1",
      body: "This is a comment",
    });

    const parsed = JSON.parse(result);
    expect(parsed).toEqual({ ok: true, commentId: "10500" });

    // Verify it sent ADF-formatted body
    const [, opts] = fetchSpy.mock.calls[0];
    const postBody = JSON.parse(opts.body);
    expect(postBody.body.type).toBe("doc");
    expect(postBody.body.version).toBe(1);
    expect(postBody.body.content[0].type).toBe("paragraph");
    expect(postBody.body.content[0].content[0].text).toBe(
      "This is a comment"
    );
  });
});
