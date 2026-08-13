export interface Config {
  siteUrl: string;    // e.g. "https://maphnet.atlassian.net"
  email: string;      // Atlassian account email
  apiToken: string;   // API token from .env
  cloudId: string;    // Hardcoded cloud instance ID
}

export function loadConfig(): Config {
  const siteUrl = process.env.ATLASSIAN_URL;
  const email = process.env.ATLASSIAN_EMAIL;
  const apiToken = process.env.ATLASSIAN_TOKEN;
  const cloudId = process.env.ATLASSIAN_CLOUD_ID;

  if (!siteUrl) throw new Error("ATLASSIAN_URL is required");
  if (!email) throw new Error("ATLASSIAN_EMAIL is required");
  if (!apiToken) throw new Error("ATLASSIAN_TOKEN is required");
  if (!cloudId) throw new Error("ATLASSIAN_CLOUD_ID is required");

  return {
    siteUrl: siteUrl.replace(/\/+$/, ""),
    email,
    apiToken,
    cloudId,
  };
}
