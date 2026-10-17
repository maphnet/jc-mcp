import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { AtlassianClient } from "../../src/client.js";
import { handleGetIssueChangelog } from "../../src/tools/get-issue-changelog.js";
import type { Config } from "../../src/config.js";

const testConfig: Config = {
  siteUrl: "https://test.atlassian.net",
  email: "user@test.com",
  apiToken: "test-token",
  cloudId: "test-cloud-id",
};

const entry = (id: string, created: string) => ({
  id,
  created,
  author: { accountId: `acc-${id}`, displayName: `User ${id}`, avatarUrls: {}, self: "https://..." },
  items: [
    { field: "status", fieldtype: "jira", from: "1", fromString: "To Do", to: "3", toString: "In Progress" },
  ],
});

const page = (values: unknown[], extra: Record<string, unknown> = {}) => ({
  ok: true,
  json: async () => ({ values, ...extra }),
});

const leanItems = [{ field: "status", from: "To Do", to: "In Progress" }];

describe("jcm_getIssueChangelog", () => {
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

  it("returns lean entries and handles missing author and from/to strings", async () => {
    fetchSpy.mockResolvedValueOnce(
      page(
        [
          entry("1", "2026-08-10T10:00:00.000+0000"),
          {
            id: "2",
            created: "2026-08-10T11:00:00.000+0000",
            items: [{ field: "labels", fieldtype: "jira", from: null, fromString: null, to: null }],
          },
        ],
        { isLast: true }
      )
    );

    const parsed = JSON.parse(await handleGetIssueChangelog(client, { issueKey: "TEST-1" }));

    expect(parsed).toEqual({
      entries: [
        { id: "1", authorAccountId: "acc-1", author: "User 1", created: "2026-08-10T10:00:00.000+0000", items: leanItems },
        {
          id: "2",
          authorAccountId: null,
          author: "Unknown",
          created: "2026-08-10T11:00:00.000+0000",
          items: [{ field: "labels", from: null, to: null }],
        },
      ],
      truncated: false,
    });
    const url = new URL(fetchSpy.mock.calls[0][0]);
    expect(url.pathname).toBe("/rest/api/3/issue/TEST-1/changelog");
    expect(url.searchParams.get("startAt")).toBe("0");
    expect(url.searchParams.get("maxResults")).toBe("100");
  });

  it("keeps only entries created strictly after since, across offset formats", async () => {
    fetchSpy.mockResolvedValueOnce(
      page(
        [
          entry("1", "2026-08-10T10:00:00.000+0000"),
          entry("2", "2026-08-10T11:00:00.000+0000"),
          entry("3", "2026-08-10T12:00:00.000+0000"),
        ],
        { isLast: true }
      )
    );

    // 13:00+02:00 == 11:00Z, so entry 2 is excluded (strict >).
    const parsed = JSON.parse(
      await handleGetIssueChangelog(client, { issueKey: "TEST-1", since: "2026-08-10T13:00:00+02:00" })
    );

    expect(parsed.entries.map((e: any) => e.id)).toEqual(["3"]);
    expect(parsed.truncated).toBe(false);
  });

  it("pages with startAt until isLast", async () => {
    fetchSpy
      .mockResolvedValueOnce(page([entry("1", "2026-08-10T10:00:00.000Z"), entry("2", "2026-08-10T11:00:00.000Z")], { isLast: false }))
      .mockResolvedValueOnce(page([entry("3", "2026-08-10T12:00:00.000Z")], { isLast: true }));

    const parsed = JSON.parse(await handleGetIssueChangelog(client, { issueKey: "TEST-1" }));

    expect(parsed.entries.map((e: any) => e.id)).toEqual(["1", "2", "3"]);
    expect(fetchSpy).toHaveBeenCalledTimes(2);
    expect(new URL(fetchSpy.mock.calls[1][0]).searchParams.get("startAt")).toBe("2");
  });

  it("stops via total when isLast is missing", async () => {
    fetchSpy.mockResolvedValueOnce(page([entry("1", "2026-08-10T10:00:00.000Z")], { total: 1 }));

    const parsed = JSON.parse(await handleGetIssueChangelog(client, { issueKey: "TEST-1" }));

    expect(parsed.entries).toHaveLength(1);
    expect(fetchSpy).toHaveBeenCalledOnce();
  });

  it("caps at maxResults, returning the oldest matches and truncated: true", async () => {
    fetchSpy.mockResolvedValueOnce(
      page(
        [
          entry("1", "2026-08-10T10:00:00.000Z"),
          entry("2", "2026-08-10T11:00:00.000Z"),
          entry("3", "2026-08-10T12:00:00.000Z"),
        ],
        { isLast: true }
      )
    );

    const parsed = JSON.parse(await handleGetIssueChangelog(client, { issueKey: "TEST-1", maxResults: 2 }));

    expect(parsed.entries.map((e: any) => e.id)).toEqual(["1", "2"]);
    expect(parsed.truncated).toBe(true);
  });

  it("does not truncate between entries sharing the same created", async () => {
    fetchSpy.mockResolvedValueOnce(
      page(
        [
          entry("1", "2026-08-10T10:00:00.000Z"),
          entry("2", "2026-08-10T11:00:00.000+0000"),
          entry("3", "2026-08-10T11:00:00.000Z"),
          entry("4", "2026-08-10T12:00:00.000Z"),
        ],
        { isLast: true }
      )
    );

    const parsed = JSON.parse(await handleGetIssueChangelog(client, { issueKey: "TEST-1", maxResults: 2 }));

    expect(parsed.entries.map((e: any) => e.id)).toEqual(["1", "2", "3"]);
    expect(parsed.truncated).toBe(true);
  });

  it("rejects an unparseable since before any request", async () => {
    await expect(
      handleGetIssueChangelog(client, { issueKey: "TEST-1", since: "yesterday" })
    ).rejects.toThrow("Invalid 'since'");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it.each(["2026-08-10T14:30:00", "2026-08-10"])("rejects since without a timezone offset (%s)", async (since) => {
    await expect(handleGetIssueChangelog(client, { issueKey: "TEST-1", since })).rejects.toThrow("Invalid 'since'");
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
