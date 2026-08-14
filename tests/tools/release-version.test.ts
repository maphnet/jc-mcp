import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { handleReleaseVersion } from "../../src/tools/release-version.js";
import { AtlassianClient } from "../../src/client.js";

vi.stubGlobal("fetch", vi.fn());

describe("jcm_releaseVersion", () => {
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

  it("releases version and returns confirmation", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(
        JSON.stringify({ id: "10050", name: "1.0.0", released: true }),
        { status: 200 }
      )
    );

    const result = JSON.parse(
      await handleReleaseVersion(client, { versionId: "10050" })
    );

    expect(result).toEqual({ ok: true, id: "10050", name: "1.0.0" });
  });
});
