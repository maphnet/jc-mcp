import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { AtlassianClient } from "../src/client.js";
import type { Config } from "../src/config.js";

const testConfig: Config = {
  siteUrl: "https://test.atlassian.net",
  email: "user@test.com",
  apiToken: "test-token",
  cloudId: "test-cloud-id",
};

describe("AtlassianClient", () => {
  let client: AtlassianClient;
  let fetchSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    client = new AtlassianClient(testConfig);
    fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("jiraGet sends correct auth header and URL", async () => {
    fetchSpy.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ key: "TEST-1" }),
    });

    const result = await client.jiraGet("/rest/api/3/issue/TEST-1", {
      fields: "summary,status",
    });

    expect(fetchSpy).toHaveBeenCalledOnce();
    const [url, opts] = fetchSpy.mock.calls[0];
    expect(url).toBe(
      "https://test.atlassian.net/rest/api/3/issue/TEST-1?fields=summary%2Cstatus"
    );
    expect(opts.headers["Authorization"]).toBe(
      "Basic " + Buffer.from("user@test.com:test-token").toString("base64")
    );
    expect(opts.headers["Accept"]).toBe("application/json");
    expect(result).toEqual({ key: "TEST-1" });
  });

  it("jiraPut sends PUT and does not parse body", async () => {
    fetchSpy.mockResolvedValueOnce({ ok: true, status: 204 });

    await client.jiraPut("/rest/api/3/issue/TEST-1", {
      fields: { summary: "Updated" },
    });

    const [, opts] = fetchSpy.mock.calls[0];
    expect(opts.method).toBe("PUT");
    expect(JSON.parse(opts.body)).toEqual({
      fields: { summary: "Updated" },
    });
  });

  it("jiraPost sends POST and returns parsed JSON", async () => {
    fetchSpy.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ id: "10001", key: "TEST-2" }),
    });

    const result = await client.jiraPost("/rest/api/3/issue", {
      fields: { summary: "New issue" },
    });

    const [, opts] = fetchSpy.mock.calls[0];
    expect(opts.method).toBe("POST");
    expect(result).toEqual({ id: "10001", key: "TEST-2" });
  });

  it("throws on non-ok response with status and message", async () => {
    fetchSpy.mockResolvedValueOnce({
      ok: false,
      status: 404,
      statusText: "Not Found",
      text: () => Promise.resolve("Issue not found"),
    });

    await expect(client.jiraGet("/rest/api/3/issue/BAD-1")).rejects.toThrow(
      "Jira API error 404: Issue not found"
    );
  });

  it("truncates long error bodies to 200 characters", async () => {
    const longBody = "x".repeat(300);
    fetchSpy.mockResolvedValueOnce({
      ok: false,
      status: 500,
      text: () => Promise.resolve(longBody),
    });

    try {
      await client.jiraGet("/rest/api/3/issue/TEST-1");
      expect.unreachable("Should have thrown");
    } catch (err: any) {
      expect(err.message).toContain("Jira API error 500:");
      expect(err.message).toContain("...");
      // "Jira API error 500: " (20 chars) + 200 chars + "..." (3 chars) = 223
      expect(err.message.length).toBe(223);
    }
  });

  it("confluenceGet uses correct base URL", async () => {
    fetchSpy.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ id: "12345" }),
    });

    await client.confluenceGet("/wiki/api/v2/pages/12345");

    const [url] = fetchSpy.mock.calls[0];
    expect(url).toBe("https://test.atlassian.net/wiki/api/v2/pages/12345");
  });
});
