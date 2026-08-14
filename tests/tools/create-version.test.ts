import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { handleCreateVersion } from "../../src/tools/create-version.js";
import { AtlassianClient } from "../../src/client.js";

vi.stubGlobal("fetch", vi.fn());

describe("jcm_createVersion", () => {
  let client: AtlassianClient;

  beforeEach(() => {
    client = new AtlassianClient({
      siteUrl: "https://test.atlassian.net",
      email: "a@b.com",
      apiToken: "tok",
      cloudId: "cid",
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("creates version and returns id, name", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(
        JSON.stringify({ id: "10050", name: "1.0.0", self: "https://..." }),
        { status: 201 }
      )
    );

    const result = JSON.parse(
      await handleCreateVersion(client, { projectKey: "TST", name: "1.0.0" })
    );

    expect(result).toEqual({ id: "10050", name: "1.0.0" });
  });
});
