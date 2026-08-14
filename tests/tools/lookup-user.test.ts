import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { AtlassianClient } from "../../src/client.js";
import type { Config } from "../../src/config.js";

const testConfig: Config = {
  siteUrl: "https://test.atlassian.net",
  email: "user@test.com",
  apiToken: "test-token",
  cloudId: "test-cloud-id",
};

const searchResponse = [
  {
    accountId: "abc123",
    displayName: "Jane Doe",
    emailAddress: "jane@example.com",
    active: true,
    avatarUrls: { "48x48": "https://avatar.example.com/48" },
    self: "https://test.atlassian.net/rest/api/3/user?accountId=abc123",
    locale: "en_US",
    accountType: "atlassian",
  },
];

describe("jcm_lookupUser", () => {
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

  it("returns array of lean users matching the email", async () => {
    fetchSpy.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(searchResponse),
    });

    const { handleLookupUser } = await import(
      "../../src/tools/lookup-user.js"
    );
    const result = await handleLookupUser(client, {
      email: "jane@example.com",
    });
    const parsed = JSON.parse(result);

    expect(parsed).toHaveLength(1);
    expect(parsed[0].accountId).toBe("abc123");
    expect(parsed[0].displayName).toBe("Jane Doe");
    expect(parsed[0].email).toBe("jane@example.com");
    expect(parsed[0].active).toBe(true);

    expect(parsed[0].avatarUrls).toBeUndefined();
    expect(parsed[0].self).toBeUndefined();
    expect(parsed[0].locale).toBeUndefined();
    expect(parsed[0].emailAddress).toBeUndefined();
    expect(parsed[0].accountType).toBeUndefined();
  });

  it("returns empty array when no users match", async () => {
    fetchSpy.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve([]),
    });

    const { handleLookupUser } = await import(
      "../../src/tools/lookup-user.js"
    );
    const result = await handleLookupUser(client, {
      email: "nobody@example.com",
    });
    const parsed = JSON.parse(result);

    expect(parsed).toEqual([]);
  });

  it("passes email as query parameter", async () => {
    fetchSpy.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve([]),
    });

    const { handleLookupUser } = await import(
      "../../src/tools/lookup-user.js"
    );
    await handleLookupUser(client, { email: "jane@example.com" });

    const [url] = fetchSpy.mock.calls[0];
    expect(url).toContain("/rest/api/3/user/search");
    expect(url).toContain("query=jane%40example.com");
  });
});
