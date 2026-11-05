import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { AtlassianClient } from "../../src/client.js";
import type { Config } from "../../src/config.js";
import { handleGetIssues } from "../../src/tools/get-issues.js";

const testConfig: Config = {
  siteUrl: "https://test.atlassian.net",
  email: "user@test.com",
  apiToken: "test-token",
  cloudId: "test-cloud-id",
};

const adf = (text: string) => ({
  type: "doc",
  version: 1,
  content: [{ type: "paragraph", content: [{ type: "text", text }] }],
});

const comment = (n: number, body = `c${n}`) => ({
  id: String(n),
  author: { displayName: `User ${n}`, accountId: `acc-${n}` },
  body: adf(body),
  created: `2026-11-0${n}T10:00:00.000+0000`,
  updated: `2026-11-0${n}T10:00:00.000+0000`,
});

describe("jcm_getIssues", () => {
  let fetchSpy: ReturnType<typeof vi.fn>;
  let client: AtlassianClient;

  const jiraReturns = (issues: unknown[]) =>
    fetchSpy.mockResolvedValueOnce({ ok: true, json: async () => ({ issues }) });

  const requestUrl = () => new URL(String(fetchSpy.mock.calls[0][0]));

  beforeEach(() => {
    fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    client = new AtlassianClient(testConfig);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns one entry per unique key in request order, with {key, error} for keys the search omits", async () => {
    jiraReturns([
      {
        key: "A-1",
        fields: {
          summary: "Alpha",
          issuetype: { name: "Task" },
          status: { name: "Open" },
          description: adf("alpha desc"),
          comment: { total: 0, comments: [] },
        },
      },
      {
        key: "B-2",
        fields: {
          summary: "Beta",
          issuetype: { name: "Bug" },
          status: { name: "Done" },
          parent: { key: "E-1", fields: { summary: "Epic", issuetype: { name: "Epic" } } },
          description: null,
          comment: { total: 0, comments: [] },
        },
      },
    ]);

    const result = JSON.parse(
      await handleGetIssues(client, { issueKeys: ["B-2", "A-1", "B-2", "C-3"] })
    );

    expect(result).toEqual([
      {
        key: "B-2",
        summary: "Beta",
        type: "Bug",
        status: "Done",
        parent: { key: "E-1", summary: "Epic", type: "Epic" },
        description: null,
        comments: [],
      },
      {
        key: "A-1",
        summary: "Alpha",
        type: "Task",
        status: "Open",
        parent: null,
        description: "alpha desc",
        comments: [],
      },
      { key: "C-3", error: "not found, no access, or moved" },
    ]);

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const url = requestUrl();
    expect(url.pathname).toContain("/rest/api/3/search/jql");
    expect(url.searchParams.get("jql")).toBe("key in (B-2, A-1, C-3)");
    expect(url.searchParams.get("fields")).toBe(
      "summary,issuetype,status,parent,description,comment"
    );
    expect(url.searchParams.get("maxResults")).toBe("50");
  });

  it("caps text at the default limits with an inline marker and keeps the 3 most recent comments", async () => {
    jiraReturns([
      {
        key: "A-1",
        fields: {
          summary: "Alpha",
          description: adf("d".repeat(1500)),
          comment: {
            total: 5,
            comments: [comment(1), comment(2), comment(3), comment(4), comment(5, "b".repeat(500))],
          },
        },
      },
      {
        key: "B-2",
        fields: { summary: "Beta", comment: { total: 2, comments: [comment(1), comment(2)] } },
      },
    ]);

    const [a, b] = JSON.parse(await handleGetIssues(client, { issueKeys: ["A-1", "B-2"] }));

    expect(a.description).toBe("d".repeat(600) + "… [truncated, 1500 chars total]");
    expect(a.comments).toEqual([
      { author: "User 3", body: "c3", created: "2026-11-03T10:00:00.000+0000" },
      { author: "User 4", body: "c4", created: "2026-11-04T10:00:00.000+0000" },
      {
        author: "User 5",
        body: "b".repeat(300) + "… [truncated, 500 chars total]",
        created: "2026-11-05T10:00:00.000+0000",
      },
    ]);
    expect(a.commentsTotal).toBe(5);

    expect(b.comments.map((c: { body: string }) => c.body)).toEqual(["c1", "c2"]);
    expect(b).not.toHaveProperty("commentsTotal");
  });

  it("fetches and returns only the selected fields and honours a custom cap", async () => {
    jiraReturns([{ key: "A-1", fields: { summary: "Alpha", description: adf("hello world") } }]);

    const [a] = JSON.parse(
      await handleGetIssues(client, {
        issueKeys: ["A-1"],
        fields: ["description"],
        maxDescriptionChars: 5,
      })
    );

    expect(requestUrl().searchParams.get("fields")).toBe(
      "summary,issuetype,status,parent,description"
    );
    expect(a.description).toBe("hello… [truncated, 11 chars total]");
    expect(a).not.toHaveProperty("comments");
  });

  it("follows nextPageToken so issues on later pages are not reported missing", async () => {
    fetchSpy.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ issues: [{ key: "A-1", fields: { summary: "One" } }], nextPageToken: "tok" }),
    });
    jiraReturns([{ key: "A-2", fields: { summary: "Two" } }]);

    const res = JSON.parse(await handleGetIssues(client, { issueKeys: ["A-1", "A-2"] }));

    expect(res.map((e: any) => e.summary)).toEqual(["One", "Two"]);
    expect(new URL(String(fetchSpy.mock.calls[1][0])).searchParams.get("nextPageToken")).toBe("tok");
  });
});
