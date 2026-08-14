import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { AtlassianClient } from "../../src/client.js";
import type { Config } from "../../src/config.js";

const testConfig: Config = {
  siteUrl: "https://test.atlassian.net",
  email: "user@test.com",
  apiToken: "test-token",
  cloudId: "test-cloud-id",
};

const myselfResponse = {
  accountId: "abc123",
  displayName: "Jane Doe",
  emailAddress: "jane@example.com",
  active: true,
  avatarUrls: { "48x48": "https://avatar.example.com/48" },
  self: "https://test.atlassian.net/rest/api/3/user?accountId=abc123",
  locale: "en_US",
  timeZone: "America/New_York",
  accountType: "atlassian",
};

describe("jcm_getCurrentUser", () => {
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

  it("returns lean user with flattened fields", async () => {
    fetchSpy.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(myselfResponse),
    });

    const { handleGetCurrentUser } = await import(
      "../../src/tools/get-current-user.js"
    );
    const result = await handleGetCurrentUser(client);
    const parsed = JSON.parse(result);

    expect(parsed.accountId).toBe("abc123");
    expect(parsed.displayName).toBe("Jane Doe");
    expect(parsed.email).toBe("jane@example.com");
    expect(parsed.active).toBe(true);

    expect(parsed.avatarUrls).toBeUndefined();
    expect(parsed.self).toBeUndefined();
    expect(parsed.locale).toBeUndefined();
    expect(parsed.timeZone).toBeUndefined();
    expect(parsed.emailAddress).toBeUndefined();
    expect(parsed.accountType).toBeUndefined();
  });

  it("calls the correct API endpoint", async () => {
    fetchSpy.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(myselfResponse),
    });

    const { handleGetCurrentUser } = await import(
      "../../src/tools/get-current-user.js"
    );
    await handleGetCurrentUser(client);

    const [url] = fetchSpy.mock.calls[0];
    expect(url).toContain("/rest/api/3/myself");
  });
});
