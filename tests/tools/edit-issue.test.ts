import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { AtlassianClient } from "../../src/client.js";
import type { Config } from "../../src/config.js";

const testConfig: Config = {
  siteUrl: "https://test.atlassian.net",
  email: "user@test.com",
  apiToken: "test-token",
  cloudId: "test-cloud-id",
};

describe("jcm_editIssue", () => {
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

  it("sends PUT and returns minimal confirmation", async () => {
    fetchSpy.mockResolvedValueOnce({ ok: true, status: 204 });

    const { handleEditIssue } = await import("../../src/tools/edit-issue.js");
    const result = await handleEditIssue(client, {
      issueKey: "TEST-1",
      fields: { summary: "Updated title", labels: ["urgent"] },
    });

    const parsed = JSON.parse(result);
    expect(parsed).toEqual({ ok: true, key: "TEST-1" });

    // Verify it called PUT with correct body
    const [url, opts] = fetchSpy.mock.calls[0];
    expect(url).toContain("/rest/api/3/issue/TEST-1");
    expect(opts.method).toBe("PUT");
    expect(JSON.parse(opts.body)).toEqual({
      fields: { summary: "Updated title", labels: ["urgent"] },
    });
  });

  it("converts string description field to ADF, passes other fields through", async () => {
    fetchSpy.mockResolvedValueOnce({ ok: true, status: 204 });

    const { handleEditIssue } = await import("../../src/tools/edit-issue.js");
    await handleEditIssue(client, {
      issueKey: "TEST-1",
      fields: {
        summary: "Plain string stays as-is",
        description: "## New description\n\nWith **bold** text",
      },
    });

    const [, opts] = fetchSpy.mock.calls[0];
    const body = JSON.parse(opts.body);
    expect(body.fields.summary).toBe("Plain string stays as-is");
    expect(body.fields.description.type).toBe("doc");
    expect(body.fields.description.version).toBe(1);
    expect(body.fields.description.content[0].type).toBe("heading");
  });

  it("does not convert description when it is already an ADF object", async () => {
    fetchSpy.mockResolvedValueOnce({ ok: true, status: 204 });

    const adfObj = { type: "doc", version: 1, content: [] };
    const { handleEditIssue } = await import("../../src/tools/edit-issue.js");
    await handleEditIssue(client, {
      issueKey: "TEST-1",
      fields: { description: adfObj },
    });

    const [, opts] = fetchSpy.mock.calls[0];
    const body = JSON.parse(opts.body);
    expect(body.fields.description).toEqual(adfObj);
  });

  it("sends update-only body without fields", async () => {
    fetchSpy.mockResolvedValueOnce({ ok: true, status: 204 });

    const { handleEditIssue } = await import("../../src/tools/edit-issue.js");
    const result = await handleEditIssue(client, {
      issueKey: "TEST-1",
      update: { fixVersions: [{ add: { name: "1.2.0" } }] },
    });

    expect(JSON.parse(result)).toEqual({ ok: true, key: "TEST-1" });
    const [, opts] = fetchSpy.mock.calls[0];
    expect(JSON.parse(opts.body)).toEqual({
      update: { fixVersions: [{ add: { name: "1.2.0" } }] },
    });
  });

  it("sends both fields and update", async () => {
    fetchSpy.mockResolvedValueOnce({ ok: true, status: 204 });

    const { handleEditIssue } = await import("../../src/tools/edit-issue.js");
    await handleEditIssue(client, {
      issueKey: "TEST-1",
      fields: { summary: "New" },
      update: { labels: [{ add: "x" }] },
    });

    const [, opts] = fetchSpy.mock.calls[0];
    expect(JSON.parse(opts.body)).toEqual({
      fields: { summary: "New" },
      update: { labels: [{ add: "x" }] },
    });
  });

  it("rejects when neither fields nor update is provided, without calling fetch", async () => {
    const { handleEditIssue } = await import("../../src/tools/edit-issue.js");
    await expect(handleEditIssue(client, { issueKey: "TEST-1" })).rejects.toThrow(/fields.*update/);
    await expect(
      handleEditIssue(client, { issueKey: "TEST-1", fields: {}, update: {} })
    ).rejects.toThrow(/fields.*update/);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("shows op verbs and truncated, single-line payloads in the confirmation summary", async () => {
    process.env.JCM_CONFIRM_WRITES = "true";
    try {
      fetchSpy.mockResolvedValue({ ok: true, status: 204, text: async () => "" });
      const server = { server: { elicitInput: vi.fn().mockResolvedValue({ action: "accept", content: { confirm: true } }) } } as any;
      const { handleEditIssue } = await import("../../src/tools/edit-issue.js");
      await handleEditIssue(
        client,
        {
          issueKey: "PROJ-1",
          fields: { summary: "New\ninjected line" },
          update: {
            fixVersions: [{ add: { name: "1.2.0" } }],
            labels: [{ set: [] }],
            comment: [{ add: { body: "x".repeat(500) } }],
            weird: "nope" as any,
          },
        },
        server
      );
      const msg: string = server.server.elicitInput.mock.calls[0][0].message;
      expect(msg).toContain('fixVersions:add {"name":"1.2.0"}');
      expect(msg).toContain("labels:set []");
      expect(msg).toContain("comment:add");
      expect(msg).toContain('weird: "nope"');
      expect(msg).toContain("summary=");
      expect(msg).not.toContain("x".repeat(300));
      expect(msg).not.toContain("New\ninjected");
    } finally {
      delete process.env.JCM_CONFIRM_WRITES;
    }
  });
});
