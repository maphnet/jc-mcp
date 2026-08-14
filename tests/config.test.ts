import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { loadConfig } from "../src/config.js";

describe("loadConfig", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.ATLASSIAN_URL;
    delete process.env.ATLASSIAN_EMAIL;
    delete process.env.ATLASSIAN_TOKEN;
    delete process.env.ATLASSIAN_CLOUD_ID;
  });

  it("uses ATLASSIAN_CLOUD_ID when provided", async () => {
    process.env.ATLASSIAN_URL = "https://test.atlassian.net";
    process.env.ATLASSIAN_EMAIL = "a@b.com";
    process.env.ATLASSIAN_TOKEN = "tok";
    process.env.ATLASSIAN_CLOUD_ID = "explicit-id";

    const config = await loadConfig();
    expect(config.cloudId).toBe("explicit-id");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("auto-discovers cloudId when not provided", async () => {
    process.env.ATLASSIAN_URL = "https://test.atlassian.net";
    process.env.ATLASSIAN_EMAIL = "a@b.com";
    process.env.ATLASSIAN_TOKEN = "tok";

    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ cloudId: "discovered-id" }), { status: 200 })
    );

    const config = await loadConfig();
    expect(config.cloudId).toBe("discovered-id");
    expect(fetch).toHaveBeenCalledWith(
      "https://test.atlassian.net/_edge/tenant_info",
      expect.objectContaining({ signal: expect.any(AbortSignal) })
    );
  });

  it("throws descriptive error when auto-discovery fails", async () => {
    process.env.ATLASSIAN_URL = "https://test.atlassian.net";
    process.env.ATLASSIAN_EMAIL = "a@b.com";
    process.env.ATLASSIAN_TOKEN = "tok";

    vi.mocked(fetch).mockResolvedValueOnce(
      new Response("Not Found", { status: 404 })
    );

    await expect(loadConfig()).rejects.toThrow("ATLASSIAN_CLOUD_ID");
  });

  it("throws when response is 200 but cloudId field is missing", async () => {
    process.env.ATLASSIAN_URL = "https://test.atlassian.net";
    process.env.ATLASSIAN_EMAIL = "a@b.com";
    process.env.ATLASSIAN_TOKEN = "tok";

    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({}), { status: 200 })
    );

    await expect(loadConfig()).rejects.toThrow("No cloudId in response");
  });

  it("throws when required env vars are missing", async () => {
    await expect(loadConfig()).rejects.toThrow("ATLASSIAN_URL");
  });

  it("strips trailing slashes from siteUrl", async () => {
    process.env.ATLASSIAN_URL = "https://test.atlassian.net///";
    process.env.ATLASSIAN_EMAIL = "a@b.com";
    process.env.ATLASSIAN_TOKEN = "tok";
    process.env.ATLASSIAN_CLOUD_ID = "cid";

    const config = await loadConfig();
    expect(config.siteUrl).toBe("https://test.atlassian.net");
  });
});
