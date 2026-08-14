import { describe, it, expect, vi, beforeEach } from "vitest";
import { handleListVersions } from "../../src/tools/list-versions.js";
import { AtlassianClient } from "../../src/client.js";

vi.stubGlobal("fetch", vi.fn());

describe("jcm_listVersions", () => {
  let client: AtlassianClient;

  beforeEach(() => {
    client = new AtlassianClient({
      siteUrl: "https://test.atlassian.net",
      email: "a@b.com",
      apiToken: "tok",
      cloudId: "cid",
    });
  });

  it("returns lean version list", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(
        JSON.stringify([
          { id: "10050", name: "1.0.0", released: false, self: "https://...", description: "first" },
          { id: "10051", name: "1.1.0", released: true, releaseDate: "2026-08-01", self: "https://..." },
        ]),
        { status: 200 }
      )
    );

    const result = JSON.parse(
      await handleListVersions(client, { projectKey: "TST" })
    );

    expect(result).toEqual([
      { id: "10050", name: "1.0.0", released: false, releaseDate: null },
      { id: "10051", name: "1.1.0", released: true, releaseDate: "2026-08-01" },
    ]);
  });
});
