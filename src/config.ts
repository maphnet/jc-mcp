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

async function discoverCloudId(siteUrl: string): Promise<string> {
  const url = `${siteUrl}/_edge/tenant_info`;
  let response: Response;
  try {
    response = await fetch(url, { signal: AbortSignal.timeout(10_000) });
  } catch (error) {
    throw new Error(
      `Could not reach ${url} within 10s. Check ATLASSIAN_URL or set ATLASSIAN_CLOUD_ID manually.`
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
