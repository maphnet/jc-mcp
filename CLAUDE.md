# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**jc-mcp** (`@maphnet/jc-mcp`) is a Jira and Confluence MCP (Model Context Protocol) server focused on optimizing token efficiency for everyday tasks. Unlike general-purpose Atlassian MCP servers, this server is designed to return concise, structured responses that minimize token consumption while preserving the information LLM agents actually need.

## Development Commands

```bash
npm install          # Install dependencies
npm run build        # Compile TypeScript to dist/
npm start            # Run the compiled server (stdio transport)
npm run dev          # Run with auto-reload (tsx watch)
npm test             # Run tests once (vitest)
npm run test:watch   # Run tests in watch mode
npx tsc --noEmit     # Type-check without emitting
```

## Publishing to npm

```bash
npm version patch        # bump version (patch / minor / major)
npm run build            # compile TypeScript
npm publish --access public   # publish @maphnet/jc-mcp (scoped → needs flag)
git push && git push --tags   # push version commit + tag created by npm version
```

`npm version` also syncs `server.json` automatically (via the `version` script). The server's reported version is read from `package.json` at runtime; never hard-code it.

Requires `npm login` if not already authenticated.

## Architecture

The server uses `@modelcontextprotocol/sdk` with stdio transport. Tool implementations live in `src/tools/`, each exporting a `register(server, client)` function and a testable `handle*` function. Transport is stdio by default; `JCM_TRANSPORT=http` serves MCP Streamable HTTP from `src/http-transport.ts` (one `McpServer` per client session, one shared `AtlassianClient`).

```
src/
├── index.ts              # Entry: loadConfig → stdio (default) or HTTP (JCM_TRANSPORT=http) + signal handling
├── server.ts             # createServer(client): McpServer — registers all tools (one per stdio process / HTTP session)
├── http-transport.ts     # Streamable HTTP: session map, Host check, idle sweep, close() handle
├── config.ts             # Env var loading (ATLASSIAN_URL, EMAIL, TOKEN, CLOUD_ID)
├── elicitation.ts        # Write-confirmation gate (JCM_CONFIRM_WRITES env flag + MCP elicitation)
├── client.ts             # HTTP client for Jira/Confluence REST APIs (Basic auth)
├── adf-to-markdown.ts    # ADF + Confluence storage format → markdown converter
├── markdown-to-adf.ts        # Markdown → ADF (Jira) & XHTML storage (Confluence) converter
├── types.ts              # Lean response type definitions
└── tools/                # One file per MCP tool (24 tools total)
    ├── get-issue.ts      # Priority 1: Jira issue read (flattened, ADF→markdown)
    ├── get-issue-changelog.ts # Field-change history, oldest first, `since` filter + paging ({entries, truncated})
    ├── get-attachment-download-link.ts # On-demand temporary Jira attachment URL (no file bytes)
    ├── get-transitions.ts# Priority 1: Workflow transitions ([{id, name}])
    ├── edit-issue.ts     # Priority 1: Issue field update ({ok, key})
    ├── transition-issue.ts# Priority 1: Workflow state change
    ├── convert-issue-type.ts # Priority 1: Issue type conversion via async bulk move API + queue poll ({ok, keys, issueType, parentKey})
    ├── add-to-active-sprint.ts # Priority 2: Add issue to active scrum sprint via Agile API ({ok, key, sprintId, sprintName, boardId} | skipped | candidates)
    ├── create-issue.ts   # Priority 2: Issue creation ({key, url})
    ├── add-comment.ts    # Priority 2: Comment (markdown → ADF)
    ├── search-issues.ts  # Priority 2: JQL search (lean results)
    ├── get-current-user.ts # User info: authenticated user ({accountId, displayName, email, active})
    ├── lookup-user.ts    # User lookup: find user by email ([{accountId, displayName, email, active}])
    ├── create-version.ts # Version management: create release ({id, name})
    ├── list-versions.ts  # Version management: list releases ([{id, name, released, releaseDate}])
    ├── release-version.ts# Version management: mark released ({ok, id, name})
    ├── add-issue-link.ts # Issue links: create link ({ok, issueKey, targetKey, linkType})
    ├── remove-issue-link.ts # Issue links: delete link ({ok, linkId})
    ├── get-issue-links.ts# Issue links: list links ([{id, type, inwardIssue?, outwardIssue?}])
    ├── get-article.ts    # Priority 3: Confluence page read
    ├── lookup-space.ts   # Priority 3: Confluence space key → numeric ID ({id, key, name})
    ├── create-article.ts # Priority 3: Confluence page creation
    ├── update-article.ts # Priority 3: Confluence page update
    └── search-articles.ts# Priority 3: Confluence CQL search
```

## Environment Variables

Required in `.env` (or shell environment):

| Variable | Description |
|----------|-------------|
| `ATLASSIAN_URL` | Site URL, e.g. `https://maphnet.atlassian.net` |
| `ATLASSIAN_EMAIL` | Atlassian account email |
| `ATLASSIAN_TOKEN` | API token from https://id.atlassian.com/manage-profile/security/api-tokens |
| `ATLASSIAN_CLOUD_ID` | Cloud instance ID (auto-discovered if omitted; get manually from `{siteUrl}/_edge/tenant_info`) |
| `JCM_CONFIRM_WRITES` | Set to `"true"` to require user confirmation (MCP elicitation) before write operations |
| `JCM_TRANSPORT` | `http` enables the Streamable HTTP transport; unset/other = stdio (default) |
| `JCM_HTTP_HOST` | HTTP bind address (default `127.0.0.1`; loopback only, no auth) |
| `JCM_HTTP_PORT` | HTTP port (default `3000`) |
| `JCM_HTTP_PATH` | HTTP endpoint path (default `/mcp`) |
| `JCM_HTTP_IDLE_TIMEOUT_MS` | Idle session timeout in ms (default `1800000`) |

## Key Design Principles

- **Token efficiency is the primary design goal.** Every tool response should return only the fields an LLM needs to reason and act — strip verbose HTML, redundant metadata, and deeply nested structures by default.
- **Flat responses.** Nested Atlassian objects are flattened: `status: "In Progress"` not `status: {name: "In Progress", statusCategory: {...}}`.
- **Attachments.** Issue reads include lean attachment metadata. Download URLs resolve only on demand using numeric IDs and manual redirects; credentials stay on Jira, and only the verified HTTPS Atlassian media endpoint is supported. Never log signed URLs or assume a fixed expiry.
- **No re-fetch after writes.** Write operations return minimal confirmations like `{ok: true, key: "PROJ-1"}`.
- **ADF conversion.** Jira descriptions (Atlassian Document Format) are converted to markdown server-side.
- **Markdown input.** Write tools accept markdown-formatted text and convert it to the appropriate format (ADF for Jira, XHTML storage for Confluence) server-side.
- **Async config.** `loadConfig()` is async — auto-discovers cloudId on startup when not set via env var.
- **Update this file.** When adding new tools, changing the build system, or altering project structure, update the relevant sections of CLAUDE.md so future sessions stay current.
- **Per-session servers in HTTP mode.** Never share an `McpServer` across HTTP sessions; always call `createServer(client)` per session so elicitation (`confirmWrite`) and responses stay isolated. New write tools must pass `extra.requestId` through to `confirmWrite`.
- **Polling cursors.** `updated`/`updatedJql` on issue reads come from `AtlassianClient.toJqlDate` (`/myself` timeZone memoized for 1h, minute floor, `null` on failure and not cached). Never let a convenience field fail a core read. Consumers dedupe because JQL minute granularity makes matching at-least-once. Caveat: during the DST-end repeated hour two instants share a local minute and JQL may resolve to the later one, so consumers should use a 1h lookback then.
