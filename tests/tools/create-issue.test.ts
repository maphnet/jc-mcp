import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { AtlassianClient } from "../../src/client.js";
import type { Config } from "../../src/config.js";

const testConfig: Config = {
  siteUrl: "https://test.atlassian.net",
  email: "user@test.com",
  apiToken: "test-token",
  cloudId: "test-cloud-id",
};

describe("jcm_createIssue", () => {
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

  it("creates issue and returns only key and url", async () => {
    fetchSpy.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          id: "10042",
          key: "TEST-42",
          self: "https://test.atlassian.net/rest/api/3/issue/10042",
        }),
    });

    const { handleCreateIssue } = await import(
      "../../src/tools/create-issue.js"
    );
    const result = await handleCreateIssue(client, {
      projectKey: "TEST",
      issueType: "Task",
      summary: "New task",
    });

    const parsed = JSON.parse(result);
    expect(parsed).toEqual({
      key: "TEST-42",
      url: "https://test.atlassian.net/browse/TEST-42",
    });

    // Verify POST body
    const [, opts] = fetchSpy.mock.calls[0];
    const body = JSON.parse(opts.body);
    expect(body.fields.project.key).toBe("TEST");
    expect(body.fields.issuetype.name).toBe("Task");
    expect(body.fields.summary).toBe("New task");
  });

  it("includes optional description and parent fields", async () => {
    fetchSpy.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({ id: "10043", key: "TEST-43", self: "https://..." }),
    });

    const { handleCreateIssue } = await import(
      "../../src/tools/create-issue.js"
    );
    await handleCreateIssue(client, {
      projectKey: "TEST",
      issueType: "Sub-task",
      summary: "Sub-task item",
      description: "Details here",
      parentKey: "TEST-1",
    });

    const [, opts] = fetchSpy.mock.calls[0];
    const body = JSON.parse(opts.body);
    expect(body.fields.description).toBeDefined();
    expect(body.fields.parent.key).toBe("TEST-1");
  });

  it("converts markdown description to ADF with proper structure", async () => {
    fetchSpy.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({ id: "10044", key: "TEST-44", self: "https://..." }),
    });

    const { handleCreateIssue } = await import(
      "../../src/tools/create-issue.js"
    );
    await handleCreateIssue(client, {
      projectKey: "TEST",
      issueType: "Task",
      summary: "Task with markdown",
      description: "## Overview\n\n- item one\n- item two",
    });

    const [, opts] = fetchSpy.mock.calls[0];
    const body = JSON.parse(opts.body);
    const desc = body.fields.description;
    expect(desc.type).toBe("doc");
    expect(desc.version).toBe(1);
    expect(desc.content[0].type).toBe("heading");
    expect(desc.content[1].type).toBe("bulletList");
  });
});
