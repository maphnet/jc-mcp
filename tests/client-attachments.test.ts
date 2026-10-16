import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AtlassianClient } from "../src/client.js";

const config = {
  siteUrl: "https://test.atlassian.net",
  email: "user@test.com",
  apiToken: "test-token",
  cloudId: "test-cloud-id",
};
const downloadUrl = "https://api.media.atlassian.com/file/abc-123/binary?token=sensitive-token&client=test&dl=true&name=report.pdf";
const metadata = () => new Response(JSON.stringify({ filename: "report.pdf" }), {
  headers: { "content-type": "application/json" },
});

describe("Jira attachment download resolution", () => {
  let client: AtlassianClient;
  let fetchSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    client = new AtlassianClient(config);
    fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
  });

  afterEach(() => vi.unstubAllGlobals());

  it("returns a temporary media URL and filename without following it", async () => {
    fetchSpy.mockResolvedValueOnce(metadata()).mockResolvedValueOnce(
      new Response(null, { status: 303, headers: { location: downloadUrl } })
    );
    expect(await client.jiraGetAttachmentDownloadLink("10001")).toEqual({
      attachmentId: "10001", filename: "report.pdf", url: downloadUrl, temporary: true,
    });
    expect(fetchSpy.mock.calls.map(([url]) => url)).toEqual([
      "https://test.atlassian.net/rest/api/3/attachment/10001",
      "https://test.atlassian.net/rest/api/3/attachment/content/10001",
    ]);
    // Jira negotiates the file's MIME type; forcing octet-stream gives 406 for images.
    expect(fetchSpy.mock.calls[1][1].headers.Accept).toBe("*/*");
    for (const [, init] of fetchSpy.mock.calls) {
      expect(init.redirect).toBe("manual");
      expect(init.headers.Authorization).toBe("Basic " + Buffer.from("user@test.com:test-token").toString("base64"));
      expect(init.signal).toBeInstanceOf(AbortSignal);
    }
  });

  it.each(["", "../10001", "1?url=https://evil.example", "https://evil.example", "1/2", "-1", "1.5", "１２３", "1\n"])(
    "rejects invalid ID %j before any request", async (id) => {
      await expect(client.jiraGetAttachmentDownloadLink(id)).rejects.toThrow("only digits");
      expect(fetchSpy).not.toHaveBeenCalled();
    }
  );

  it.each([401, 403, 404, 500])("reports metadata HTTP %i without echoing its body", async (status) => {
    fetchSpy.mockResolvedValueOnce(new Response("sensitive-token test-token Authorization", { status }));
    await expect(client.jiraGetAttachmentDownloadLink("10001")).rejects.toThrow(`HTTP ${status}`);
    expect(fetchSpy).toHaveBeenCalledOnce();
  });

  it.each([401, 403, 404, 500])("reports content HTTP %i safely", async (status) => {
    fetchSpy.mockResolvedValueOnce(metadata()).mockResolvedValueOnce(new Response("secret-response-body", { status }));
    await expect(client.jiraGetAttachmentDownloadLink("10001")).rejects.toThrow(`HTTP ${status}`);
  });

  it.each([
    "https://evil.example/file/abc/binary?token=x",
    "http://api.media.atlassian.com/file/abc/binary?token=x",
    "https://api.media.atlassian.com.evil.example/file/abc/binary?token=x",
    "https://api.media.atlassian.com@evil.example/file/abc/binary?token=x",
    "https://user:password@api.media.atlassian.com/file/abc/binary?token=x",
    "https://api.media.atlassian.com:8443/file/abc/binary?token=x",
    "https://test.atlassian.net/login?token=x",
    "https://id.atlassian.com/login?token=x",
    "https://api.media.atlassian.com/login?token=x",
    "https://api.media.atlassian.com/file/abc/binary",
    "https://api.media.atlassian.com/file/abc/binary?token=",
    "https://api.media.atlassian.com/file/abc/binary?token=x#fragment",
  ])("rejects unsupported redirect %s without requesting it", async (location) => {
    fetchSpy.mockResolvedValueOnce(metadata()).mockResolvedValueOnce(new Response(null, { status: 303, headers: { location } }));
    await expect(client.jiraGetAttachmentDownloadLink("10001")).rejects.toThrow("unsupported attachment download destination");
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it.each([null, "/login", "not a URL"])("rejects missing/invalid Location %j", async (location) => {
    fetchSpy.mockResolvedValueOnce(metadata()).mockResolvedValueOnce(new Response(null, {
      status: 303, headers: location ? { location } : {},
    }));
    await expect(client.jiraGetAttachmentDownloadLink("10001")).rejects.toThrow("missing or invalid");
  });

  it("cancels direct file bytes without parsing them as JSON", async () => {
    const response = new Response(new Uint8Array([0, 255, 1]), { headers: { "content-type": "image/png" } });
    const jsonSpy = vi.spyOn(response, "json");
    const cancelSpy = vi.spyOn(response.body!, "cancel");
    fetchSpy.mockResolvedValueOnce(metadata()).mockResolvedValueOnce(response);
    await expect(client.jiraGetAttachmentDownloadLink("10001")).rejects.toThrow("file bytes directly");
    expect(jsonSpy).not.toHaveBeenCalled();
    expect(cancelSpy).toHaveBeenCalledOnce();
  });

  it("rejects a login HTML response even when Location is present", async () => {
    fetchSpy.mockResolvedValueOnce(metadata()).mockResolvedValueOnce(new Response("<html>login</html>", {
      headers: { "content-type": "text/html", location: downloadUrl },
    }));
    await expect(client.jiraGetAttachmentDownloadLink("10001")).rejects.toThrow("did not provide a temporary download redirect");
  });

  it.each([
    new Response("<html>login</html>", { headers: { "content-type": "text/html" } }),
    new Response(null, { status: 302, headers: { location: "https://id.atlassian.com/login" } }),
    new Response("not JSON", { headers: { "content-type": "application/json" } }),
    new Response("{}", { headers: { "content-type": "application/json" } }),
  ])("rejects unexpected metadata without requesting content", async (response) => {
    fetchSpy.mockResolvedValueOnce(response);
    await expect(client.jiraGetAttachmentDownloadLink("10001")).rejects.toThrow(/metadata/);
    expect(fetchSpy).toHaveBeenCalledOnce();
  });

  it("does not leak network error details or API error bodies", async () => {
    fetchSpy.mockRejectedValueOnce(new Error("network error with Authorization Basic secret and sensitive-token"));
    await expect(client.jiraGetAttachmentDownloadLink("10001")).rejects.toThrow(
      "Could not request the Jira attachment; check connectivity and retry."
    );
    fetchSpy.mockResolvedValueOnce(new Response("Authorization Basic secret sensitive-token", { status: 403 }));
    try {
      await client.jiraGetAttachmentDownloadLink("10001");
      expect.unreachable();
    } catch (error) {
      expect((error as Error).message).toBe("Jira attachment permission denied (HTTP 403).");
    }
  });
});
