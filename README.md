<!-- mcp-name: io.github.maphnet/jc-mcp -->

# jc-mcp

Token-efficient Jira & Confluence MCP server. Returns lean, flat responses that minimize token consumption while preserving the information LLM agents need.

## Quick Start

1. Get an API token from [id.atlassian.com](https://id.atlassian.com/manage-profile/security/api-tokens)

2. Add the server to your MCP client:

```bash
claude mcp add jc-mcp \
  -e ATLASSIAN_URL=https://yoursite.atlassian.net \
  -e ATLASSIAN_EMAIL=you@example.com \
  -e ATLASSIAN_TOKEN=your-api-token \
  -- npx -y @maphnet/jc-mcp
```

That's it. CloudId is auto-discovered from your site URL.

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
| `jcm_createVersion` | Create a release version | `{id, name}` |
| `jcm_listVersions` | List project versions | `[{id, name, released, releaseDate}]` |
| `jcm_releaseVersion` | Mark a version as released | `{ok, id, name}` |
| `jcm_getArticle` | Read a Confluence page | Title + markdown body |
| `jcm_createArticle` | Create a Confluence page | `{id, url}` |
| `jcm_updateArticle` | Update a Confluence page | `{ok, id}` |
| `jcm_searchArticles` | CQL search | `[{id, title, spaceKey}]` |

## Why This Server?

Standard Atlassian MCP servers return raw API responses — deeply nested JSON with metadata LLM agents don't need. jc-mcp flattens and trims every response:

- **`jcm_getTransitions`**: ~200 tokens vs ~6,600 from raw API
- **`jcm_getIssue`**: flat `status: "In Progress"` vs nested `status.name` + `statusCategory` + `self` links
- **Write operations**: return `{ok: true, key: "PROJ-1"}` — no re-fetch

Less tokens = faster responses, lower cost, more room in the context window.

## Configuration

| Variable | Required | Description |
|----------|----------|-------------|
| `ATLASSIAN_URL` | Yes | Site URL, e.g. `https://yoursite.atlassian.net` |
| `ATLASSIAN_EMAIL` | Yes | Atlassian account email |
| `ATLASSIAN_TOKEN` | Yes | API token |
| `ATLASSIAN_CLOUD_ID` | No | Auto-discovered if omitted |

## License

MIT
