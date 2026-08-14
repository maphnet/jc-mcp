import type { Config } from "./config.js";

export class AtlassianClient {
  private baseUrl: string;
  private authHeader: string;

  constructor(config: Config) {
    this.baseUrl = config.siteUrl;
    this.authHeader =
      "Basic " +
      Buffer.from(`${config.email}:${config.apiToken}`).toString("base64");
  }

  getSiteUrl(): string {
    return this.baseUrl;
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
