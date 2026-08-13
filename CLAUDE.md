# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**jc-mcp** is a Jira and Confluence MCP (Model Context Protocol) server focused on optimizing token efficiency for everyday tasks. Unlike general-purpose Atlassian MCP servers, this server is designed to return concise, structured responses that minimize token consumption while preserving the information LLM agents actually need.

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

## Architecture

The server uses `@modelcontextprotocol/sdk` with stdio transport. Tool implementations live in `src/tools/`, each exporting a `register(server, client)` function and a testable `handle*` function.

```
src/
├── index.ts              # MCP server init + tool registration + stdio transport
├── config.ts             # Env var loading (ATLASSIAN_URL, EMAIL, TOKEN, CLOUD_ID)
├── client.ts             # HTTP client for Jira/Confluence REST APIs (Basic auth)
├── adf-to-markdown.ts    # ADF + Confluence storage format → markdown converter
├── types.ts              # Lean response type definitions
└── tools/                # One file per MCP tool (11 tools total)
    ├── get-issue.ts      # Priority 1: Jira issue read (flattened, ADF→markdown)
    ├── get-transitions.ts# Priority 1: Workflow transitions ([{id, name}])
    ├── edit-issue.ts     # Priority 1: Issue field update ({ok, key})
    ├── transition-issue.ts# Priority 1: Workflow state change
    ├── create-issue.ts   # Priority 2: Issue creation ({key, url})
    ├── add-comment.ts    # Priority 2: Comment (plain text → ADF)
    ├── search-issues.ts  # Priority 2: JQL search (lean results)
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
| `ATLASSIAN_CLOUD_ID` | Cloud instance ID (get from `{siteUrl}/_edge/tenant_info`) |

## Key Design Principles

- **Token efficiency is the primary design goal.** Every tool response should return only the fields an LLM needs to reason and act — strip verbose HTML, redundant metadata, and deeply nested structures by default.
- **Flat responses.** Nested Atlassian objects are flattened: `status: "In Progress"` not `status: {name: "In Progress", statusCategory: {...}}`.
- **No re-fetch after writes.** Write operations return minimal confirmations like `{ok: true, key: "PROJ-1"}`.
- **ADF conversion.** Jira descriptions (Atlassian Document Format) are converted to markdown server-side.
- **Update this file.** When adding new tools, changing the build system, or altering project structure, update the relevant sections of CLAUDE.md so future sessions stay current.
