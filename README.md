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
| `jcm_getIssue` | Read a Jira issue | Flat fields + markdown description + attachments + `updated`/`updatedJql`; comments carry `id`, `authorAccountId`, `updated` |
| `jcm_getIssueChangelog` | Field-change history, oldest first, optionally after `since` | `{entries: [{id, authorAccountId, author, created, items: [{field, from, to}]}], truncated}` |
| `jcm_getAttachmentDownloadLink` | Resolve a temporary attachment download URL on demand | `{attachmentId, filename, url, temporary: true}` |
| `jcm_getTransitions` | Available workflow transitions | `[{id, name}]` |
| `jcm_editIssue` | Update issue fields | `{ok, key}` |
| `jcm_transitionIssue` | Change workflow state | `{ok, key}` |
| `jcm_addToActiveSprint` | Add an issue to its project's active scrum sprint (no-op if already in one or no scrum board; returns candidates if ambiguous; pass `boardId` when several scrum boards exist) | `{ok, key, sprintId, sprintName, boardId}` or `{ok, skipped}` / `{ok: false, reason, candidates}` |
| `jcm_createIssue` | Create a new issue | `{key, url}` |
| `jcm_addComment` | Add a comment (plain text) | `{ok, id}` |
| `jcm_searchIssues` | JQL search | `{total, issues: [{key, summary, status, assignee, updated, updatedJql}]}` |
| `jcm_getCurrentUser` | Get the authenticated user | `{accountId, displayName, email, active}` |
| `jcm_lookupUser` | Find a user by email | `[{accountId, displayName, email, active}]` |
| `jcm_createVersion` | Create a release version | `{id, name}` |
| `jcm_listVersions` | List project versions | `[{id, name, released, releaseDate}]` |
| `jcm_releaseVersion` | Mark a version as released | `{ok, id, name}` |
| `jcm_addIssueLink` | Link two issues (e.g. Blocks, Relates) | `{ok, issueKey, targetKey, linkType}` |
| `jcm_removeIssueLink` | Delete an issue link by ID | `{ok, linkId}` |
| `jcm_getIssueLinks` | List links on an issue | `[{id, type, inwardIssue?, outwardIssue?}]` |
| `jcm_convertIssueType` | Change issue type (e.g. Task → Sub-task with parent) | `{ok, key, issueType, parentKey}` |
| `jcm_getArticle` | Read a Confluence page | Title + markdown body + `spaceId`, `parentId` |
| `jcm_lookupSpace` | Resolve a Confluence space key to its numeric ID | `{id, key, name}` |
| `jcm_createArticle` | Create a Confluence page | `{id, url}` |
| `jcm_updateArticle` | Update a Confluence page | `{ok, id}` |
| `jcm_searchArticles` | CQL search | `[{id, title, space, spaceKey, lastModified}]` |

To create a page next to an existing one, pass its `spaceId` (and `parentId`) from jcm_getArticle to jcm_createArticle. Otherwise resolve a space key (e.g. `spaceKey` from jcm_searchArticles) via jcm_lookupSpace. Space names are not unique — don't use them to pick a space.

### Jira attachments

Call `jcm_getIssue` to discover `attachments`: `[{id, filename, mimeType, size, content}]` (an empty array when none exist). `content` is Jira's authenticated content URL; issue reads do not resolve temporary links.

Pass the selected `id` to `jcm_getAttachmentDownloadLink` as `attachmentId`. The server uses its existing Jira credentials and returns a temporary URL plus the filename. Its Jira account needs permission to view the issue and attachment, including applicable issue security restrictions. Download the URL with a local HTTP client **without** a Jira Authorization header; file bytes stay outside the model context. For example, in a shell, after assigning the returned values to `download_url` and a local `output_path`:

```bash
curl --fail --location --proto '=https' --proto-redir '=https' --output "$output_path" "$download_url"
```

Treat the returned URL as a secret: anyone holding it may be able to download the file. Avoid public logs and tickets. URLs expire; call the tool again to obtain a fresh one. No fixed lifetime or permanent public access is promised.

The resolver supports HTTPS redirects to `api.media.atlassian.com/file/{id}/binary`. Missing or unsupported redirects, direct file responses, and authentication/permission/not-found failures produce errors. It does not host or proxy attachments. A live private Jira Cloud check on 2026-10-16 observed a `303` redirect; downloading its URL without Jira credentials matched the authenticated file byte for byte. One token carried an expiry about ten minutes after the request; that observation is not a lifetime guarantee.

### Watching a ticket

Poll with `jcm_searchIssues` using `key = PROJ-1 AND updated > "<updatedJql>"`, where `updatedJql` comes from the previous `jcm_getIssue` or `jcm_searchIssues` result. It is the issue's `updated` time floored to the minute in the Jira user's profile timezone, which is the timezone JQL uses. It is `null` if the timezone lookup failed (retry later). Because of the minute floor, the query re-matches the issue itself and anything changed within that minute. Matching is at-least-once, so compare raw `updated` values or dedupe by id. The profile timezone is re-read hourly. The no-miss guarantee does not hold during the repeated hour when daylight saving ends: two instants format to the same local minute and JQL may resolve it to the later one. During that hour, also compare raw `updated` values, or use a lookback of one hour.

On a match, read new comments with `jcm_getIssue`. Filter them by comment `id`, `created`, or `updated`, and skip your own using `authorAccountId` from `jcm_getCurrentUser`. Read field changes with `jcm_getIssueChangelog(issueKey, since)`. Entries are returned oldest first, and `since` is strict (`created > since`). When `truncated` is true, call again with `since` set to the last returned `created`.

## Why This Server?

Standard Atlassian MCP servers return raw API responses — deeply nested JSON with metadata LLM agents don't need. jc-mcp flattens and trims every response, cutting **~92% of tokens** across typical operations:

| Operation | jc-mcp | Standard MCP | Reduction |
|-----------|--------|--------------|-----------|
| Get issue | ~460 tokens | ~1,144 tokens | **60%** |
| Search (5 issues) | ~105 tokens | ~6,204 tokens | **98%** |
| Get transitions | ~17 tokens | ~313 tokens | **95%** |

- **Flat fields**: `status: "In Progress"` instead of nested `status.name` + `statusCategory` + `self` links + `iconUrl`
- **Lean search results**: `{key, summary, status, assignee, updated, updatedJql}` per issue — no descriptions, avatars, or project metadata
- **Minimal writes**: `{ok: true, key: "PROJ-1"}` — no re-fetch

Less tokens = faster responses, lower cost, more room in the context window.

## Write Confirmation (Elicitation Gate)

Set `JCM_CONFIRM_WRITES=true` to require user confirmation before every write operation. When enabled, the following tools present a confirmation form (via MCP elicitation) before executing:

- `jcm_createIssue` — create a Jira issue
- `jcm_editIssue` — update issue fields
- `jcm_transitionIssue` — change workflow state
- `jcm_addToActiveSprint` — add an issue to the active sprint
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

## HTTP transport (shared multi-client server)

By default jc-mcp speaks MCP over **stdio**, one process per client session. Set `JCM_TRANSPORT=http` to run one long-lived process per credential set that many clients (Claude Code, Codex, …) share over MCP Streamable HTTP. Every client session gets its own MCP session (isolated responses and write-confirmation prompts). All sessions share one Atlassian client.

| Variable | Default | Description |
|---|---|---|
| `JCM_TRANSPORT` | `stdio` | `http` enables HTTP mode; anything else keeps stdio |
| `JCM_HTTP_HOST` | `127.0.0.1` | Bind address. Keep it on loopback (see Security) |
| `JCM_HTTP_PORT` | `3000` | Listen port. Use a distinct port per credential set |
| `JCM_HTTP_PATH` | `/mcp` | Endpoint path |
| `JCM_HTTP_IDLE_TIMEOUT_MS` | `1800000` | Sessions with no open stream and no activity for this long are closed. Clients that disconnect cleanly (`DELETE`) are removed immediately. Sessions with an open stream are force-closed after 4x this timeout |

**Security:** the HTTP endpoint has **no authentication**. Any local process that can reach the port acts with the configured Atlassian credentials. It is meant for trusted, single-user hosts on loopback only. Requests whose `Host` header is not `127.0.0.1:<port>`, `localhost:<port>` or `[::1]:<port>` (or exactly `<host>:<port>` for a non-loopback bind) get `403` (DNS-rebinding protection); the `Origin` header, when present, is checked the same way. POST requests must send `Content-Type: application/json` (`415` otherwise), and the request body is capped at 4 MiB (`413`, checked via `Content-Length` and enforced during the read). Wildcard binds such as `0.0.0.0` or `::` are rejected at startup, including spellings Node normalizes to a wildcard (e.g. `0`, `0.0`); binding to a specific non-loopback IP is still allowed, but it remains unauthenticated — use at your own risk. Under WSL with mirrored networking, Windows-side processes and rootless Docker containers (via the slirp gateway) can also reach loopback, which falls inside this "local = trusted" model.

### systemd user services (one per credential set)

Use one template unit, `~/.config/systemd/user/jc-mcp@.service`:

```ini
[Unit]
Description=jc-mcp HTTP server (%i)
After=network-online.target

[Service]
Type=simple
EnvironmentFile=%h/.config/mcp/secrets/%i-jc-mcp.env
EnvironmentFile=%h/.config/jc-mcp/%i.env
Environment=JCM_TRANSPORT=http
# systemd does not load nvm: use the absolute output of `command -v node`
ExecStart=/home/USER/.nvm/versions/node/v24.0.0/bin/node /home/USER/dev/jc-mcp/dist/index.js
Restart=on-failure
RestartSec=2

[Install]
WantedBy=default.target
```

Per-instance port files, `~/.config/jc-mcp/<set>.env`:

```bash
# ~/.config/jc-mcp/maphnet.env
JCM_HTTP_PORT=3101
# ~/.config/jc-mcp/publius.env
JCM_HTTP_PORT=3102
# ~/.config/jc-mcp/lektra.env
JCM_HTTP_PORT=3103
```

`EnvironmentFile` accepts plain `KEY=VALUE` lines only. If a secrets file uses `export KEY=VALUE`, remove the `export` prefixes.

```bash
systemctl --user daemon-reload
systemctl --user enable --now jc-mcp@maphnet jc-mcp@publius jc-mcp@lektra
journalctl --user -u jc-mcp@maphnet -f    # expect: jc-mcp server running via http at http://127.0.0.1:3101/mcp
```

After upgrading jc-mcp (`npm run build`), run `systemctl --user restart 'jc-mcp@*'`.

### Client configuration

Claude Code (project `.mcp.json`):

```json
{
  "mcpServers": {
    "maphnet-jc-mcp": { "type": "http", "url": "http://127.0.0.1:3101/mcp" }
  }
}
```

Or from the CLI: `claude mcp add --transport http maphnet-jc-mcp http://127.0.0.1:3101/mcp`.

Codex (`~/.codex/config.toml` or project `.codex/config.toml`):

```toml
[mcp_servers.maphnet-jc-mcp]
url = "http://127.0.0.1:3101/mcp"
```

Older Codex releases also need `experimental_use_rmcp_client = true` at the top level of `config.toml`.

### Migrating from stdio group entries

1. Start the systemd instances above and confirm each one logs its URL.
2. In each of `~/.config/mcp/groups/maphnet.json`, `publius.json` and `lektra.json`, replace the jc-mcp stdio entry (`command`/`args`/env sourcing) with an HTTP entry: `{ "type": "http", "url": "http://127.0.0.1:<port>/mcp" }` (ports 3101/3102/3103).
3. Re-apply the groups in each project: `mcp-group rm <group> <dir>` then `mcp-group add <group> <dir>`.
4. Update Codex `config.toml` entries as shown above, and re-enable the jc-mcp entries that were disabled for memory reasons.
5. Restart running Claude Code and Codex sessions. MCP server config is read at session start, so existing sessions keep their old stdio processes until restarted.
6. Verify in a fresh session: the client lists the jc-mcp tools, and a read-only call such as `jcm_getIssue` on a known key succeeds.

### Memory: stdio vs HTTP

Date measured: 2026-10-12, Node v24.19.0. Procedure: start the server with fake credentials, connect N SDK clients and run `tools/list` on each, then read `ps -o rss= -p <pid>`.

| Mode | Processes | Sessions | Measured RSS |
|---|---|---|---|
| stdio (`node dist/index.js`) | 1 per session | 1 | 78.2 MB |
| stdio, 6 sessions | 6 | 6 | 469.2 MB (6 × above) |
| HTTP, idle | 1 | 0 | 90.7 MB |
| HTTP, 6 sessions | 1 | 6 | 92.9 MB |

The previous npx-launched stdio setup used 1.3-1.7 GB combined RSS across sessions, including the npm wrapper processes.

## License

MIT
