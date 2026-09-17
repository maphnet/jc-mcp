<!-- mcp-name: io.github.maphnet/jc-mcp -->

# jc-mcp

Token-efficient Jira & Confluence MCP server. Returns lean, flat responses that minimize token consumption while preserving the information LLM agents need.

## Quick Start

1. Get an API token from [id.atlassian.com](https://id.atlassian.com/manage-profile/security/api-tokens)

2. Add the server to your MCP client:

```bash
claude mcp add --scope user jc-mcp \
  -e ATLASSIAN_URL=https://yoursite.atlassian.net \
  -e ATLASSIAN_EMAIL=you@example.com \
  -e ATLASSIAN_TOKEN=your-api-token \
  -- npx -y @maphnet/jc-mcp
```

The `--scope user` flag makes the server available across all your projects. Omit it to add only for the current project. CloudId is auto-discovered from your site URL.

## Updating

npx caches packages per package spec — a cache entry created for `@maphnet/jc-mcp` (no version) is **not** refreshed by running `npx @maphnet/jc-mcp@latest`; that creates a separate entry. To actually update a server configured as `npx -y @maphnet/jc-mcp`, clear the stale entry:

```bash
# find and remove the cached copy used by the un-versioned spec
for d in ~/.npm/_npx/*/node_modules/@maphnet/jc-mcp; do
  echo "$d: $(node -p "require('$d/package.json').version")"
done
rm -rf ~/.npm/_npx/<hash-of-old-version>
```

Alternatively, configure the server as `npx -y @maphnet/jc-mcp@latest` so every start resolves the newest release.

If you installed globally (`npm i -g @maphnet/jc-mcp`, command `jc-mcp`), update with:

```bash
npm i -g @maphnet/jc-mcp@latest
```

Then restart your MCP client (Claude Code, Cursor, etc.) to pick up the new version.

## Tools

| Tool | Description | Returns |
|------|-------------|---------|
| `jcm_getIssue` | Read a Jira issue | Flat fields + markdown description |
| `jcm_getTransitions` | Available workflow transitions | `[{id, name}]` |
| `jcm_editIssue` | Update issue fields | `{ok, key}` |
| `jcm_transitionIssue` | Change workflow state | `{ok, key}` |
| `jcm_createIssue` | Create a new issue | `{key, url}` |
| `jcm_addComment` | Add a comment (plain text) | `{ok, id}` |
| `jcm_searchIssues` | JQL search | `[{key, summary, status, assignee}]` |
| `jcm_getCurrentUser` | Get the authenticated user | `{accountId, displayName, email, active}` |
| `jcm_lookupUser` | Find a user by email | `[{accountId, displayName, email, active}]` |
| `jcm_createVersion` | Create a release version | `{id, name}` |
| `jcm_listVersions` | List project versions | `[{id, name, released, releaseDate}]` |
| `jcm_releaseVersion` | Mark a version as released | `{ok, id, name}` |
| `jcm_addIssueLink` | Link two issues (e.g. Blocks, Relates) | `{ok, issueKey, targetKey, linkType}` |
| `jcm_removeIssueLink` | Delete an issue link by ID | `{ok, linkId}` |
| `jcm_getIssueLinks` | List links on an issue | `[{id, type, inwardIssue?, outwardIssue?}]` |
| `jcm_convertIssueType` | Change issue type (e.g. Task → Sub-task with parent) | `{ok, key, issueType, parentKey}` |
| `jcm_getArticle` | Read a Confluence page | Title + markdown body |
| `jcm_lookupSpace` | Resolve a Confluence space key to its numeric ID | `{id, key, name}` |
| `jcm_createArticle` | Create a Confluence page | `{id, url}` |
| `jcm_updateArticle` | Update a Confluence page | `{ok, id}` |
| `jcm_searchArticles` | CQL search | `[{id, title, spaceKey}]` |

Use jcm_lookupSpace with a known space key, then pass its returned id as spaceId to jcm_createArticle.

## Why This Server?

Standard Atlassian MCP servers return raw API responses — deeply nested JSON with metadata LLM agents don't need. jc-mcp flattens and trims every response, cutting **~92% of tokens** across typical operations:

| Operation | jc-mcp | Standard MCP | Reduction |
|-----------|--------|--------------|-----------|
| Get issue | ~460 tokens | ~1,144 tokens | **60%** |
| Search (5 issues) | ~105 tokens | ~6,204 tokens | **98%** |
| Get transitions | ~17 tokens | ~313 tokens | **95%** |

- **Flat fields**: `status: "In Progress"` instead of nested `status.name` + `statusCategory` + `self` links + `iconUrl`
- **Lean search results**: `{key, summary, status, assignee}` per issue — no descriptions, avatars, or project metadata
- **Minimal writes**: `{ok: true, key: "PROJ-1"}` — no re-fetch

Less tokens = faster responses, lower cost, more room in the context window.

## Write Confirmation (Elicitation Gate)

Set `JCM_CONFIRM_WRITES=true` to require user confirmation before every write operation. When enabled, the following tools present a confirmation form (via MCP elicitation) before executing:

- `jcm_createIssue` — create a Jira issue
- `jcm_editIssue` — update issue fields
- `jcm_transitionIssue` — change workflow state
- `jcm_addComment` — add a comment
- `jcm_createArticle` — create a Confluence page
- `jcm_updateArticle` — update a Confluence page

The confirmation shows a title and summary of the pending write. The user can:
- **Accept** — the write proceeds normally
- **Decline** or **Cancel** — the write is skipped and the tool returns `{ok: false, message: "...declined by user."}`
- **Timeout** (client-dependent) — treated as decline

Without the flag (or with any value other than `"true"`), all writes proceed immediately — existing behaviour is unchanged.

### MCP client requirements

The client must support the `elicitation/create` capability (MCP spec 2025-06-18+). In Hermes, confirmations appear as approve/deny buttons in Slack. In Claude Code, they appear as inline prompts.

```bash
claude mcp add --scope user jc-mcp \
  -e JCM_CONFIRM_WRITES=true \
  -e ATLASSIAN_URL=https://yoursite.atlassian.net \
  -e ATLASSIAN_EMAIL=you@example.com \
  -e ATLASSIAN_TOKEN=your-api-token \
  -- npx -y @maphnet/jc-mcp
```

## Configuration

| Variable | Required | Description |
|----------|----------|-------------|
| `ATLASSIAN_URL` | Yes | Site URL, e.g. `https://yoursite.atlassian.net` |
| `ATLASSIAN_EMAIL` | Yes | Atlassian account email |
| `ATLASSIAN_TOKEN` | Yes | API token |
| `ATLASSIAN_CLOUD_ID` | No | Auto-discovered if omitted |
| `JCM_CONFIRM_WRITES` | No | Set to `"true"` to require user confirmation before writes |

## License

MIT
