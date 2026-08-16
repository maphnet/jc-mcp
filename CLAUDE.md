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

Requires `npm login` if not already authenticated.

## Architecture

The server uses `@modelcontextprotocol/sdk` with stdio transport. Tool implementations live in `src/tools/`, each exporting a `register(server, client)` function and a testable `handle*` function.

```
src/
├── index.ts              # MCP server init + tool registration + stdio transport
├── config.ts             # Env var loading (ATLASSIAN_URL, EMAIL, TOKEN, CLOUD_ID)
├── client.ts             # HTTP client for Jira/Confluence REST APIs (Basic auth)
├── adf-to-markdown.ts    # ADF + Confluence storage format → markdown converter
├── markdown-to-adf.ts        # Markdown → ADF (Jira) & XHTML storage (Confluence) converter
├── types.ts              # Lean response type definitions
└── tools/                # One file per MCP tool (20 tools total)
    ├── get-issue.ts      # Priority 1: Jira issue read (flattened, ADF→markdown)
    ├── get-transitions.ts# Priority 1: Workflow transitions ([{id, name}])
    ├── edit-issue.ts     # Priority 1: Issue field update ({ok, key})
    ├── transition-issue.ts# Priority 1: Workflow state change
    ├── convert-issue-type.ts # Priority 1: Issue type conversion with two-step PUT ({ok, key, issueType, parentKey})
    ├── create-issue.ts   # Priority 2: Issue creation ({key, url})
    ├── add-comment.ts    # Priority 2: Comment (plain text → ADF)
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

## Key Design Principles

- **Token efficiency is the primary design goal.** Every tool response should return only the fields an LLM needs to reason and act — strip verbose HTML, redundant metadata, and deeply nested structures by default.
- **Flat responses.** Nested Atlassian objects are flattened: `status: "In Progress"` not `status: {name: "In Progress", statusCategory: {...}}`.
- **No re-fetch after writes.** Write operations return minimal confirmations like `{ok: true, key: "PROJ-1"}`.
- **ADF conversion.** Jira descriptions (Atlassian Document Format) are converted to markdown server-side.
- **Markdown input.** Write tools accept markdown-formatted text and convert it to the appropriate format (ADF for Jira, XHTML storage for Confluence) server-side.
- **Async config.** `loadConfig()` is async — auto-discovers cloudId on startup when not set via env var.
- **Update this file.** When adding new tools, changing the build system, or altering project structure, update the relevant sections of CLAUDE.md so future sessions stay current.
