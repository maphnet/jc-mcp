import type { Config } from "./config.js";
import type { AttachmentDownloadLink } from "./types.js";

export class AtlassianClient {
  private baseUrl: string;
  private authHeader: string;
  private tz?: Promise<string>;

  constructor(config: Config) {
    this.baseUrl = config.siteUrl;
    this.authHeader =
      "Basic " +
      Buffer.from(`${config.email}:${config.apiToken}`).toString("base64");
  }

  getSiteUrl(): string {
    return this.baseUrl;
  }

  /**
   * Formats an ISO timestamp as a JQL date ("yyyy-MM-dd HH:mm") in the
   * authenticated user's profile timezone, which is how JQL interprets dates.
   * Floored to the minute, so `updated > "<value>"` is at-least-once.
   * Returns null instead of throwing; a failed /myself lookup is not cached.
   */
  async toJqlDate(iso: string): Promise<string | null> {
    const date = new Date(iso);
    if (!iso || Number.isNaN(date.getTime())) return null;
    // Cache the promise (set synchronously) so concurrent callers share one request.
    const tz = (this.tz ??= this.jiraGet<{ timeZone?: string }>("/rest/api/3/myself").then((u) => {
      if (!u.timeZone) throw new Error("No timeZone on /myself");
      return u.timeZone;
    }));
    try {
      const parts = Object.fromEntries(
        new Intl.DateTimeFormat("en-CA", {
          timeZone: await tz,
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
          hour: "2-digit",
          minute: "2-digit",
          hourCycle: "h23",
        })
          .formatToParts(date)
          .map((p) => [p.type, p.value])
      );
      return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}`;
    } catch {
      if (this.tz === tz) this.tz = undefined;
      return null;
    }
  }

  async jiraGetAttachmentDownloadLink(attachmentId: string): Promise<AttachmentDownloadLink> {
    if (!/^[0-9]+$/.test(attachmentId)) {
      throw new Error("Attachment ID must contain only digits.");
    }

    const metadata = await this.attachmentGet(`/rest/api/3/attachment/${attachmentId}`, "application/json");
    if (metadata.status !== 200 || !metadata.headers.get("content-type")?.includes("application/json")) {
      await metadata.body?.cancel();
      throw new Error("Jira returned an unexpected attachment metadata response.");
    }
    let filename: unknown;
    try {
      filename = ((await metadata.json()) as { filename?: unknown }).filename;
    } catch {
      throw new Error("Jira returned invalid attachment metadata.");
    }
    if (typeof filename !== "string" || !filename) {
      throw new Error("Jira returned attachment metadata without a filename.");
    }

    const response = await this.attachmentGet(
      `/rest/api/3/attachment/content/${attachmentId}`,
      "*/*"
    );
    const location = response.headers.get("location");
    await response.body?.cancel();
    if (![301, 302, 303, 307, 308].includes(response.status)) {
      throw new Error("Jira did not provide a temporary download redirect (it may have returned file bytes directly).");
    }

    let url: URL;
    try {
      url = new URL(location ?? "");
    } catch {
      throw new Error("Jira returned a missing or invalid attachment download redirect.");
    }
    // Only the independently verified Atlassian media endpoint is supported.
    // Never follow this URL on the server or forward Jira credentials to it.
    if (
      url.protocol !== "https:" || url.hostname !== "api.media.atlassian.com" ||
      url.port !== "" || url.username || url.password || url.hash ||
      !/^\/file\/[A-Za-z0-9-]+\/binary$/.test(url.pathname) ||
      !url.searchParams.get("token")
    ) {
      throw new Error("Jira returned an unsupported attachment download destination.");
    }

    return { attachmentId, filename, url: url.href, temporary: true };
  }

  private async attachmentGet(path: string, accept: string): Promise<Response> {
    let response: Response;
    try {
      response = await fetch(`${this.baseUrl}${path}`, {
        method: "GET",
        headers: { Authorization: this.authHeader, Accept: accept },
        redirect: "manual",
        signal: AbortSignal.timeout(10_000),
      });
    } catch {
      // Network errors can contain URLs. Do not expose credentials or signed links.
      throw new Error("Could not request the Jira attachment; check connectivity and retry.");
    }
    if (response.status >= 400) {
      await response.body?.cancel();
      const reason = response.status === 401 ? "authentication failed"
        : response.status === 403 ? "permission denied"
        : response.status === 404 ? "not found or not accessible"
        : "request failed";
      throw new Error(`Jira attachment ${reason} (HTTP ${response.status}).`);
    }
    return response;
  }

  async jiraGet<T>(
    path: string,
    params?: Record<string, string>
  ): Promise<T> {
    return this.request<T>("GET", path, undefined, params);
  }

  async jiraPost<T>(path: string, body: unknown): Promise<T> {
    return this.request<T>("POST", path, body);
  }

  async jiraPut(path: string, body: unknown): Promise<void> {
    await this.rawRequest("PUT", path, body);
  }

  async jiraPutJson<T>(path: string, body: unknown): Promise<T> {
    return this.request<T>("PUT", path, body);
  }

  async jiraPostNoContent(path: string, body: unknown): Promise<void> {
    await this.rawRequest("POST", path, body);
  }

  async jiraDelete(path: string): Promise<void> {
    await this.rawRequest("DELETE", path);
  }

  async confluenceGet<T>(
    path: string,
    params?: Record<string, string>
  ): Promise<T> {
    return this.request<T>("GET", path, undefined, params);
  }

  async confluencePost<T>(path: string, body: unknown): Promise<T> {
    return this.request<T>("POST", path, body);
  }

  async confluencePut<T>(path: string, body: unknown): Promise<T> {
    return this.request<T>("PUT", path, body);
  }

  private async request<T>(
    method: string,
    path: string,
    body?: unknown,
    params?: Record<string, string>
  ): Promise<T> {
    const response = await this.rawRequest(method, path, body, params);
    return response.json() as Promise<T>;
  }

  private async rawRequest(
    method: string,
    path: string,
    body?: unknown,
    params?: Record<string, string>
  ): Promise<Response> {
    let url = `${this.baseUrl}${path}`;
    if (params && Object.keys(params).length > 0) {
      url += "?" + new URLSearchParams(params).toString();
    }

    const headers: Record<string, string> = {
      Authorization: this.authHeader,
      Accept: "application/json",
    };

    const init: RequestInit = { method, headers };

    if (body !== undefined) {
      headers["Content-Type"] = "application/json";
      init.body = JSON.stringify(body);
    }

    const response = await fetch(url, init);

    if (!response.ok) {
      const errorBody = await response.text();
      const truncated = errorBody.length > 200 ? errorBody.slice(0, 200) + "..." : errorBody;
      const prefix = path.startsWith("/wiki/") ? "Confluence" : "Jira";
      throw new Error(`${prefix} API error ${response.status}: ${truncated}`);
    }

    return response;
  }
}
