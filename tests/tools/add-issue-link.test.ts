import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { handleAddIssueLink } from "../../src/tools/add-issue-link.js";
import { AtlassianClient } from "../../src/client.js";

vi.stubGlobal("fetch", vi.fn());

describe("jcm_addIssueLink", () => {
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

  it("makes issueKey the source: A blocks B sends inwardIssue=A, outwardIssue=B", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response(null, { status: 201 }));

    const result = JSON.parse(
      await handleAddIssueLink(client, {
        issueKey: "A-1",
        targetIssueKey: "B-1",
        linkType: "Blocks",
      })
    );

    const [url, init] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit];
    expect(url).toContain("/rest/api/3/issueLink");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string)).toEqual({
      type: { name: "Blocks" },
      inwardIssue: { key: "A-1" },
      outwardIssue: { key: "B-1" },
    });
    expect(result).toEqual({ ok: true, issueKey: "A-1", targetKey: "B-1", linkType: "Blocks" });
  });
});
