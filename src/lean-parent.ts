import type { LeanParent } from "./types.js";

export function toLeanParent(p: any): LeanParent | null {
  if (!p?.key) return null;
  return { key: p.key, summary: p.fields?.summary ?? "", type: p.fields?.issuetype?.name ?? "" };
}
