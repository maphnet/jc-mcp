import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { AtlassianClient } from "../../src/client.js";
import { register } from "../../src/tools/get-issue.js";
import type { Config } from "../../src/config.js";

const testConfig: Config = {
  siteUrl: "https://test.atlassian.net",
  email: "user@test.com",
  apiToken: "test-token",
  cloudId: "test-cloud-id",
};

// Raw Jira API response (realistic shape)
const jiraIssueResponse = {
  key: "TEST-1",
  fields: {
    summary: "Fix login bug",
    description: {
      type: "doc",
      version: 1,
      content: [
        {
          type: "paragraph",
          content: [{ type: "text", text: "The login page crashes on submit." }],
        },
      ],
    },
    status: { name: "In Progress", statusCategory: { name: "In Progress" } },
    issuetype: { name: "Bug", iconUrl: "https://..." },
    priority: { name: "High", iconUrl: "https://..." },
    assignee: {
      displayName: "Jane Doe",
      accountId: "abc123",
      avatarUrls: {},
      self: "https://...",
    },
    labels: ["backend", "auth"],
    comment: {
      comments: [
        {
          author: { displayName: "Bob Smith" },
          body: {
            type: "doc",
            version: 1,
            content: [
              {
                type: "paragraph",
                content: [{ type: "text", text: "Looking into this now." }],
              },
            ],
          },
          created: "2026-08-10T14:30:00.000+0000",
        },
      ],
    },
  },
  expand: "renderedFields,names,schema",
  self: "https://test.atlassian.net/rest/api/3/issue/10001",
};

describe("jcm_getIssue", () => {
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

  it("returns a lean issue with flattened fields and markdown description", async () => {
    fetchSpy.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(jiraIssueResponse),
    });

    // We need to call the handler directly to test.
    // Import the handler function for direct testing.
    const { handleGetIssue } = await import("../../src/tools/get-issue.js");
    const result = await handleGetIssue(client, { issueKey: "TEST-1" });

    // Verify the fetch was called with selective fields
    const [url] = fetchSpy.mock.calls[0];
    expect(url).toContain("fields=");
    expect(url).toContain("summary");
    expect(url).toContain("description");

    // Verify the lean response shape
    const parsed = JSON.parse(result);
    expect(parsed.key).toBe("TEST-1");
    expect(parsed.summary).toBe("Fix login bug");
    expect(parsed.description).toBe("The login page crashes on submit.");
    expect(parsed.status).toBe("In Progress");
    expect(parsed.type).toBe("Bug");
    expect(parsed.priority).toBe("High");
    expect(parsed.assignee).toBe("Jane Doe");
    expect(parsed.labels).toEqual(["backend", "auth"]);
    expect(parsed.comments).toHaveLength(1);
    expect(parsed.comments[0].author).toBe("Bob Smith");
    expect(parsed.comments[0].body).toBe("Looking into this now.");
    expect(parsed.attachments).toEqual([]);

    // Verify bloat fields are NOT present
    expect(parsed.expand).toBeUndefined();
    expect(parsed.self).toBeUndefined();
    expect(parsed.fields).toBeUndefined();
  });

  it("selects and maps lean attachment metadata without resolving download links", async () => {
    const attachment = {
      id: "10001",
      filename: "report.pdf",
      mimeType: "application/pdf",
      size: 1234,
      content: "https://test.atlassian.net/rest/api/3/attachment/content/10001",
    };
    fetchSpy.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        ...jiraIssueResponse,
        fields: {
          ...jiraIssueResponse.fields,
          attachment: [{ ...attachment, author: { displayName: "Jane Doe" }, thumbnail: "https://example.com/thumb" }],
        },
      }),
    });

    const { handleGetIssue } = await import("../../src/tools/get-issue.js");
    const parsed = JSON.parse(await handleGetIssue(client, { issueKey: "TEST-1" }));

    expect(parsed.attachments).toEqual([attachment]);
    expect(fetchSpy).toHaveBeenCalledOnce();
    const url = new URL(fetchSpy.mock.calls[0][0]);
    expect(url.searchParams.get("fields")?.split(",")).toContain("attachment");
  });

  it("returns an empty attachments collection when Jira returns an empty array", async () => {
    fetchSpy.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ fields: { attachment: [] } }),
    });
    const { handleGetIssue } = await import("../../src/tools/get-issue.js");
    const parsed = JSON.parse(await handleGetIssue(client, { issueKey: "TEST-1" }));
    expect(parsed.attachments).toEqual([]);
  });

  // Routes /myself to a timezone response, everything else to the issue.
  function routeFetch(issue: unknown, myself: () => unknown) {
    fetchSpy.mockImplementation(async (url: string) =>
      url.includes("/rest/api/3/myself")
        ? myself()
        : { ok: true, json: async () => issue }
    );
  }
  const myselfCalls = () =>
    fetchSpy.mock.calls.filter(([url]) => String(url).includes("/rest/api/3/myself")).length;

  const watchedIssue = {
    key: "TEST-1",
    fields: {
      updated: "2026-08-10T23:45:30.000+0000",
      comment: {
        comments: [
          {
            id: "10100",
            author: { displayName: "Bob Smith", accountId: "bob-1" },
            body: { type: "doc", version: 1, content: [] },
            created: "2026-08-10T14:30:00.000+0000",
            updated: "2026-08-10T15:00:00.000+0000",
          },
          { id: "10101", body: null, created: "2026-08-10T16:00:00.000+0000" },
        ],
      },
    },
  };

  it("returns comment ids, author accountIds, updated, and issue updated/updatedJql", async () => {
    routeFetch(watchedIssue, () => ({ ok: true, json: async () => ({ timeZone: "Europe/Berlin" }) }));
    const { handleGetIssue } = await import("../../src/tools/get-issue.js");
    const parsed = JSON.parse(await handleGetIssue(client, { issueKey: "TEST-1" }));

    expect(new URL(fetchSpy.mock.calls[0][0]).searchParams.get("fields")?.split(",")).toContain("updated");
    expect(parsed.updated).toBe("2026-08-10T23:45:30.000+0000");
    // 23:45 UTC is 01:45 next day in Berlin (CEST); seconds floored away.
    expect(parsed.updatedJql).toBe("2026-08-11 01:45");
    expect(parsed.comments).toEqual([
      {
        id: "10100",
        author: "Bob Smith",
        authorAccountId: "bob-1",
        body: "",
        created: "2026-08-10T14:30:00.000+0000",
        updated: "2026-08-10T15:00:00.000+0000",
      },
      {
        id: "10101",
        author: "Unknown",
        authorAccountId: null,
        body: "",
        created: "2026-08-10T16:00:00.000+0000",
        updated: "",
      },
    ]);
  });

  it("looks up the profile timezone once per client", async () => {
    routeFetch(watchedIssue, () => ({ ok: true, json: async () => ({ timeZone: "America/New_York" }) }));
    const { handleGetIssue } = await import("../../src/tools/get-issue.js");
    const first = JSON.parse(await handleGetIssue(client, { issueKey: "TEST-1" }));
    const second = JSON.parse(await handleGetIssue(client, { issueKey: "TEST-1" }));

    expect(first.updatedJql).toBe("2026-08-10 19:45");
    expect(second.updatedJql).toBe("2026-08-10 19:45");
    expect(myselfCalls()).toBe(1);
  });

  it("re-reads the profile timezone after 1 hour", async () => {
    routeFetch(watchedIssue, () => ({ ok: true, json: async () => ({ timeZone: "America/New_York" }) }));
    const { handleGetIssue } = await import("../../src/tools/get-issue.js");
    const realNow = Date.now();
    const now = vi.spyOn(Date, "now").mockReturnValue(realNow);
    try {
      await handleGetIssue(client, { issueKey: "TEST-1" });
      now.mockReturnValue(realNow + 3_600_001);
      await handleGetIssue(client, { issueKey: "TEST-1" });
      expect(myselfCalls()).toBe(2);
    } finally {
      now.mockRestore();
    }
  });

  it("formats local midnight as 00, not 24", async () => {
    routeFetch(
      { key: "TEST-1", fields: { updated: "2026-08-10T22:05:00.000+0000" } },
      () => ({ ok: true, json: async () => ({ timeZone: "Europe/Berlin" }) })
    );
    const { handleGetIssue } = await import("../../src/tools/get-issue.js");
    const parsed = JSON.parse(await handleGetIssue(client, { issueKey: "TEST-1" }));

    expect(parsed.updatedJql).toBe("2026-08-11 00:05");
  });

  it("returns updatedJql null when /myself fails, and retries on the next call", async () => {
    const myself = vi
      .fn()
      .mockReturnValueOnce({ ok: false, status: 500, text: async () => "boom" })
      .mockReturnValueOnce({ ok: true, json: async () => ({ timeZone: "UTC" }) });
    routeFetch(watchedIssue, myself);
    const { handleGetIssue } = await import("../../src/tools/get-issue.js");

    const failed = JSON.parse(await handleGetIssue(client, { issueKey: "TEST-1" }));
    expect(failed.key).toBe("TEST-1");
    expect(failed.updatedJql).toBeNull();

    const retried = JSON.parse(await handleGetIssue(client, { issueKey: "TEST-1" }));
    expect(retried.updatedJql).toBe("2026-08-10 23:45");
    expect(myselfCalls()).toBe(2);
  });

  it("skips the timezone lookup when the issue has no updated value", async () => {
    routeFetch({ key: "TEST-1", fields: {} }, () => {
      throw new Error("should not be called");
    });
    const { handleGetIssue } = await import("../../src/tools/get-issue.js");
    const parsed = JSON.parse(await handleGetIssue(client, { issueKey: "TEST-1" }));

    expect(parsed.updated).toBe("");
    expect(parsed.updatedJql).toBeNull();
    expect(myselfCalls()).toBe(0);
  });
});
