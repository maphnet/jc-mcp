# Markdown Input Support for Write Tools

## Problem

All write tools (Jira: `createIssue`, `addComment`, `editIssue`; Confluence: `createArticle`, `updateArticle`) accept plain text and wrap it in a single ADF paragraph or pass it raw. When an LLM sends markdown-formatted text (headings, lists, bold, etc.), the markdown syntax appears as literal characters in Jira/Confluence instead of being rendered as rich formatting.

The read side (`adf-to-markdown.ts`) already converts rich ADF back to markdown, creating an asymmetry: reading gives structured markdown, but writing flattens everything to a single paragraph.

## Solution

Add markdown-to-ADF conversion for Jira tools and markdown-to-XHTML (Confluence storage format) conversion for Confluence tools. Use existing libraries instead of writing custom parsers.

## Dependencies

- **`marklassian`** (MIT, zero deps, ~40K weekly npm downloads) — converts Markdown to Atlassian Document Format (ADF). Supports: headings, paragraphs, bold/italic/strikethrough, links, images, code blocks, nested lists, blockquotes, horizontal rules, tables, GFM task lists.
- **`markdown-it`** (MIT, zero deps, ~30M weekly npm downloads) — renders Markdown to HTML, which maps directly to Confluence storage format (XHTML).

## Architecture

### New module: `src/markdown-to-adf.ts`

Exports two functions:

```ts
export function markdownToAdf(markdown: string): AdfDocument
export function markdownToStorage(markdown: string): string
```

- `markdownToAdf` wraps `marklassian` behind the project's own interface.
- `markdownToStorage` uses `markdown-it` to render markdown to HTML. Confluence storage format is XHTML, and `markdown-it` output with `xhtmlOut: true` produces valid storage format for the supported feature set.

### Tool changes

#### Jira tools (use `markdownToAdf`)

**`create-issue.ts`**
- `description` field: change `.describe()` from "Plain text description" to "Description (supports markdown formatting)".
- Replace the hardcoded single-paragraph ADF construction with `markdownToAdf(params.description)`.

**`add-comment.ts`**
- `body` field: change `.describe()` to "Comment text (supports markdown formatting)".
- Replace the hardcoded single-paragraph ADF construction with `markdownToAdf(params.body)`.

**`edit-issue.ts`**
- Intercept the `description` field in the `fields` record before sending: if `fields.description` is a `string`, convert it to ADF via `markdownToAdf()`. All other fields pass through unchanged. Only `description` is intercepted — it is the only standard Jira field that requires ADF and is commonly passed as a plain string by LLM callers.
- Update tool description to note that description fields accept markdown.

#### Confluence tools (use `markdownToStorage`)

**`create-article.ts`**
- `body` field: change `.describe()` to "Page body content (supports markdown formatting)".
- Wrap `params.body` with `markdownToStorage()` before sending.

**`update-article.ts`**
- `body` field: change `.describe()` to "Updated page body content (supports markdown formatting)".
- Wrap `params.body` with `markdownToStorage()` before sending.

## Supported markdown features

| Feature | Jira (ADF) | Confluence (storage) |
|---|---|---|
| Headings (h1-h6) | Yes | Yes |
| Bold / italic | Yes | Yes |
| Bullet lists | Yes | Yes |
| Numbered lists | Yes | Yes |
| Code blocks (with lang) | Yes | Yes |
| Inline code | Yes | Yes |
| Links | Yes | Yes |
| Horizontal rules | Yes | Yes |
| Tables | Yes | Yes |

## Backward compatibility

This is a non-breaking change. Plain text is valid markdown (renders as a single paragraph), so existing callers that send unformatted strings get identical behavior. The only difference: callers who send markdown-formatted text now get properly structured rich content instead of literal syntax characters.

## Error handling

Both `marklassian` and `markdown-it` degrade gracefully on malformed input — unrecognized syntax stays as plain text. No additional error handling is needed.

## Testing

### Converter tests (`test/markdown-to-adf.test.ts`)

- Plain text paragraph produces single paragraph ADF node
- `## Heading` produces heading node with level 2
- `**bold**` / `*italic*` produce text with appropriate marks
- Bullet and numbered lists produce bulletList/orderedList nodes
- Fenced code blocks produce codeBlock nodes with language attribute
- `[text](url)` produces text with link mark
- Tables produce table/tableRow/tableCell nodes
- Mixed content (heading + paragraph + list) produces correct node sequence

### Confluence converter tests (`test/markdown-to-storage.test.ts`)

- Headings produce `<h1>`-`<h6>` tags
- Bold/italic produce `<strong>`/`<em>` tags
- Lists produce `<ul>`/`<ol>` with `<li>`
- Code blocks produce `<pre><code>` blocks
- Tables produce `<table>` with `<thead>`/`<tbody>`

### Tool integration tests

- `handleCreateIssue` with markdown description produces correct ADF in request body
- `handleAddComment` with markdown body produces correct ADF
- `handleEditIssue` with string description field converts to ADF, other fields pass through
- `handleCreateArticle` with markdown body produces XHTML storage format
- `handleUpdateArticle` with markdown body produces XHTML storage format

## CLAUDE.md updates

Update the Architecture section to mention the new `markdown-to-adf.ts` module and its purpose. Update the Key Design Principles to note that write tools accept markdown input.
