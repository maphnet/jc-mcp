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

  if (!siteUrl) throw new Error("ATLASSIAN_URL is required");
  if (!email) throw new Error("ATLASSIAN_EMAIL is required");
  if (!apiToken) throw new Error("ATLASSIAN_TOKEN is required");

  const cleanUrl = siteUrl.replace(/\/+$/, "");
  const cloudId = cloudIdEnv || (await discoverCloudId(cleanUrl));

  return { siteUrl: cleanUrl, email, apiToken, cloudId };
}
