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

  it("surfaces the underlying network error and keeps the cause", async () => {
    process.env.ATLASSIAN_URL = "https://test.atlassian.net";
    process.env.ATLASSIAN_EMAIL = "a@b.com";
    process.env.ATLASSIAN_TOKEN = "tok";

    const cause = Object.assign(new Error("connect ECONNREFUSED 127.0.0.1:12334"), {
      code: "ECONNREFUSED",
    });
    const fetchError = new TypeError("fetch failed", { cause });
    vi.mocked(fetch).mockRejectedValueOnce(fetchError);

    const err = await loadConfig().catch((e) => e);
    expect(err.message).toContain("ECONNREFUSED 127.0.0.1:12334");
    expect(err.message).not.toContain("within 10s");
    expect(err.message).toContain("ATLASSIAN_CLOUD_ID");
    expect(err.cause).toBe(fetchError);
  });

  it("joins per-address messages from an AggregateError cause", async () => {
    process.env.ATLASSIAN_URL = "https://test.atlassian.net";
    process.env.ATLASSIAN_EMAIL = "a@b.com";
    process.env.ATLASSIAN_TOKEN = "tok";

    const cause = Object.assign(
      new AggregateError(
        [new Error("connect ECONNREFUSED ::1:12334"), new Error("connect ECONNREFUSED 127.0.0.1:12334")],
        ""
      ),
      { code: "ECONNREFUSED" }
    );
    vi.mocked(fetch).mockRejectedValueOnce(new TypeError("fetch failed", { cause }));

    const err = await loadConfig().catch((e) => e);
    expect(err.message).toContain("127.0.0.1:12334");
    expect(err.message).not.toContain("ECONNREFUSED )");
  });

  it("reports a 10s timeout only for TimeoutError", async () => {
    process.env.ATLASSIAN_URL = "https://test.atlassian.net";
    process.env.ATLASSIAN_EMAIL = "a@b.com";
    process.env.ATLASSIAN_TOKEN = "tok";

    const timeout = new DOMException("The operation was aborted due to timeout", "TimeoutError");
    vi.mocked(fetch).mockRejectedValueOnce(timeout);

    const err = await loadConfig().catch((e) => e);
    expect(err.message).toContain("within 10s");
    expect(err.cause).toBe(timeout);
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
