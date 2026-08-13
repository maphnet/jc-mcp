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

    // Verify bloat fields are NOT present
    expect(parsed.expand).toBeUndefined();
    expect(parsed.self).toBeUndefined();
    expect(parsed.fields).toBeUndefined();
  });
});
