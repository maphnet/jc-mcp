export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConfigError";
  }
}

export interface Config {
  siteUrl: string;
  email: string;
  apiToken: string;
  cloudId: string;
}

// Node's fetch wraps the real reason (e.g. ECONNREFUSED) in `error.cause`.
function describeFetchError(error: unknown): string {
  const cause = error instanceof Error ? error.cause : undefined;
  const source = cause instanceof Error ? cause : error;
  const code = (source as { code?: unknown } | null)?.code;
  let message = source instanceof Error ? source.message : String(source);
  // AggregateError (autoSelectFamily) has an empty message; the addresses live in `errors`.
  const errors = (source as { errors?: unknown } | null)?.errors;
  if (!message && Array.isArray(errors)) {
    message = errors.map((e) => (e instanceof Error ? e.message : String(e))).join("; ");
  }
  message = message.trim() || (error instanceof Error ? error.message : "");
  return typeof code === "string" && !message.includes(code) ? `${code} ${message}`.trim() : message;
}

async function discoverCloudId(siteUrl: string): Promise<string> {
  const url = `${siteUrl}/_edge/tenant_info`;
  let response: Response;
  try {
    response = await fetch(url, { signal: AbortSignal.timeout(10_000) });
  } catch (error) {
    const reason =
      error instanceof Error && error.name === "TimeoutError"
        ? "within 10s"
        : describeFetchError(error);
    throw new Error(
      `Could not reach ${url} (${reason}). Check ATLASSIAN_URL or set ATLASSIAN_CLOUD_ID manually.`,
      { cause: error }
    );
  }
  if (!response.ok) {
    throw new Error(
      `Could not auto-discover cloudId from ${url} (HTTP ${response.status}). ` +
      `Set ATLASSIAN_CLOUD_ID manually.`
    );
  }
  const data = (await response.json()) as { cloudId?: string };
  if (!data.cloudId) {
    throw new Error(
      `No cloudId in response from ${url}. Set ATLASSIAN_CLOUD_ID manually.`
    );
  }
  return data.cloudId;
}

export async function loadConfig(): Promise<Config> {
  const siteUrl = process.env.ATLASSIAN_URL;
  const email = process.env.ATLASSIAN_EMAIL;
  const apiToken = process.env.ATLASSIAN_TOKEN;
  const cloudIdEnv = process.env.ATLASSIAN_CLOUD_ID;

  const missing: { name: string; description: string }[] = [];
  if (!siteUrl) missing.push({ name: "ATLASSIAN_URL", description: "Atlassian site URL (e.g. https://yourorg.atlassian.net)" });
  if (!email) missing.push({ name: "ATLASSIAN_EMAIL", description: "Atlassian account email" });
  if (!apiToken) missing.push({ name: "ATLASSIAN_TOKEN", description: "Atlassian API token from https://id.atlassian.com/manage-profile/security/api-tokens" });

  if (missing.length > 0) {
    const lines = missing.map((v) => `  ${v.name} — ${v.description}`).join("\n");
    throw new ConfigError(
      `Missing required environment variable${missing.length > 1 ? "s" : ""}:\n${lines}\n\n` +
      `Set these in your MCP client config or in a .env file / shell environment.`
    );
  }

  const cleanUrl = siteUrl!.replace(/\/+$/, "");
  const cloudId = cloudIdEnv || (await discoverCloudId(cleanUrl));

  return { siteUrl: cleanUrl, email: email!, apiToken: apiToken!, cloudId };
}
