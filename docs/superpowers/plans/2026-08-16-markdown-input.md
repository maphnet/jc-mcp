# Markdown Input Support — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convert markdown input to proper ADF (Jira) and XHTML storage format (Confluence) in all write tools, so LLM-generated markdown renders as rich text instead of literal syntax.

**Architecture:** A new `src/markdown-to-adf.ts` module wraps two libraries — `marklassian` for markdown→ADF and `markdown-it` for markdown→XHTML. Each write tool calls the appropriate converter before sending to the API. Tests verify both converters and each tool's integration.

**Tech Stack:** marklassian (markdown→ADF), markdown-it (markdown→HTML/XHTML), vitest (tests)

## Global Constraints

- Node ≥18, ESM (`"type": "module"` in package.json)
- TypeScript strict mode, `module: "Node16"`, `moduleResolution: "Node16"`
- Tests use vitest with `vi.stubGlobal("fetch", ...)` pattern for HTTP mocking
- Follow existing test structure: `tests/` mirrors `src/`, tool tests live in `tests/tools/`
- Existing tools use dynamic `import()` in tests to avoid module caching issues
- All `.js` extensions in imports (TypeScript Node16 resolution)

---

### Task 1: Install dependencies and create converter module

**Files:**
- Modify: `package.json` (add `marklassian`, `markdown-it`, `@types/markdown-it`)
- Create: `src/markdown-to-adf.ts`
- Create: `tests/markdown-to-adf.test.ts`

**Interfaces:**
- Produces:
  - `markdownToAdf(markdown: string): { version: 1; type: "doc"; content: unknown[] }` — converts markdown string to ADF document
  - `markdownToStorage(markdown: string): string` — converts markdown string to XHTML storage format

- [ ] **Step 1: Install dependencies**

```bash
npm install marklassian markdown-it
npm install -D @types/markdown-it
```

- [ ] **Step 2: Write failing tests for `markdownToAdf`**

Create `tests/markdown-to-adf.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { markdownToAdf, markdownToStorage } from "../src/markdown-to-adf.js";

describe("markdownToAdf", () => {
  it("converts plain text to single paragraph ADF", () => {
    const result = markdownToAdf("Hello world");
    expect(result.type).toBe("doc");
    expect(result.version).toBe(1);
    expect(result.content).toHaveLength(1);
    expect(result.content[0].type).toBe("paragraph");
  });

  it("converts heading to heading ADF node", () => {
    const result = markdownToAdf("## Section Title");
    const heading = result.content[0];
    expect(heading.type).toBe("heading");
    expect(heading.attrs.level).toBe(2);
  });

  it("converts bold and italic to text with marks", () => {
    const result = markdownToAdf("**bold** and *italic*");
    const paragraph = result.content[0];
    expect(paragraph.type).toBe("paragraph");
    const textNodes = paragraph.content;
    const boldNode = textNodes.find(
      (n: any) => n.marks?.some((m: any) => m.type === "strong")
    );
    expect(boldNode).toBeDefined();
    expect(boldNode.text).toBe("bold");
    const italicNode = textNodes.find(
      (n: any) => n.marks?.some((m: any) => m.type === "em")
    );
    expect(italicNode).toBeDefined();
    expect(italicNode.text).toBe("italic");
  });

  it("converts bullet list to bulletList ADF node", () => {
    const result = markdownToAdf("- item one\n- item two");
    const list = result.content[0];
    expect(list.type).toBe("bulletList");
    expect(list.content).toHaveLength(2);
    expect(list.content[0].type).toBe("listItem");
  });

  it("converts numbered list to orderedList ADF node", () => {
    const result = markdownToAdf("1. first\n2. second");
    const list = result.content[0];
    expect(list.type).toBe("orderedList");
    expect(list.content).toHaveLength(2);
  });

  it("converts fenced code block to codeBlock ADF node", () => {
    const result = markdownToAdf("```typescript\nconst x = 1;\n```");
    const codeBlock = result.content[0];
    expect(codeBlock.type).toBe("codeBlock");
    expect(codeBlock.attrs.language).toBe("typescript");
  });

  it("converts link to text with link mark", () => {
    const result = markdownToAdf("[click here](https://example.com)");
    const paragraph = result.content[0];
    const linkNode = paragraph.content.find(
      (n: any) => n.marks?.some((m: any) => m.type === "link")
    );
    expect(linkNode).toBeDefined();
    expect(linkNode.text).toBe("click here");
    const linkMark = linkNode.marks.find((m: any) => m.type === "link");
    expect(linkMark.attrs.href).toBe("https://example.com");
  });

  it("converts table to table ADF node", () => {
    const md = "| A | B |\n|---|---|\n| 1 | 2 |";
    const result = markdownToAdf(md);
    const table = result.content[0];
    expect(table.type).toBe("table");
  });

  it("converts horizontal rule to rule ADF node", () => {
    const result = markdownToAdf("---");
    const rule = result.content[0];
    expect(rule.type).toBe("rule");
  });

  it("converts mixed content in correct order", () => {
    const md = "## Title\n\nSome text\n\n- item";
    const result = markdownToAdf(md);
    expect(result.content[0].type).toBe("heading");
    expect(result.content[1].type).toBe("paragraph");
    expect(result.content[2].type).toBe("bulletList");
  });
});

describe("markdownToStorage", () => {
  it("converts headings to HTML heading tags", () => {
    const result = markdownToStorage("## Hello");
    expect(result).toContain("<h2>");
    expect(result).toContain("Hello");
    expect(result).toContain("</h2>");
  });

  it("converts bold to strong tags", () => {
    const result = markdownToStorage("**bold**");
    expect(result).toContain("<strong>bold</strong>");
  });

  it("converts italic to em tags", () => {
    const result = markdownToStorage("*italic*");
    expect(result).toContain("<em>italic</em>");
  });

  it("converts bullet lists to ul/li", () => {
    const result = markdownToStorage("- one\n- two");
    expect(result).toContain("<ul>");
    expect(result).toContain("<li>");
    expect(result).toContain("</ul>");
  });

  it("converts ordered lists to ol/li", () => {
    const result = markdownToStorage("1. first\n2. second");
    expect(result).toContain("<ol>");
    expect(result).toContain("<li>");
    expect(result).toContain("</ol>");
  });

  it("converts code blocks to pre/code", () => {
    const result = markdownToStorage("```js\nconst x = 1;\n```");
    expect(result).toContain("<pre>");
    expect(result).toContain("<code");
    expect(result).toContain("const x = 1;");
  });

  it("converts tables to table HTML", () => {
    const md = "| A | B |\n|---|---|\n| 1 | 2 |";
    const result = markdownToStorage(md);
    expect(result).toContain("<table>");
    expect(result).toContain("<th>");
    expect(result).toContain("<td>");
  });

  it("converts links to anchor tags", () => {
    const result = markdownToStorage("[text](https://example.com)");
    expect(result).toContain('<a href="https://example.com"');
    expect(result).toContain("text</a>");
  });

  it("self-closes br tags for XHTML compliance", () => {
    const result = markdownToStorage("line1  \nline2");
    expect(result).toContain("<br />");
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

```bash
npx vitest run tests/markdown-to-adf.test.ts
```

Expected: FAIL — module `../src/markdown-to-adf.js` does not exist.

- [ ] **Step 4: Implement `src/markdown-to-adf.ts`**

```typescript
import { markdownToAdf as marklassianToAdf } from "marklassian";
import MarkdownIt from "markdown-it";

const md = new MarkdownIt({ xhtmlOut: true });

export function markdownToAdf(markdown: string): {
  version: 1;
  type: "doc";
  content: any[];
} {
  return marklassianToAdf(markdown);
}

export function markdownToStorage(markdown: string): string {
  return md.render(markdown);
}
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
npx vitest run tests/markdown-to-adf.test.ts
```

Expected: All tests PASS.

- [ ] **Step 6: Run full test suite to check for regressions**

```bash
npm test
```

Expected: All existing tests still pass.

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json src/markdown-to-adf.ts tests/markdown-to-adf.test.ts
git commit -m "feat: add markdown-to-ADF and markdown-to-storage converters"
```

---

### Task 2: Update Jira write tools to use markdown conversion

**Files:**
- Modify: `src/tools/create-issue.ts:9-12,31-42`
- Modify: `src/tools/add-comment.ts:7,13-25`
- Modify: `src/tools/edit-issue.ts:16-24`
- Modify: `tests/tools/create-issue.test.ts`
- Modify: `tests/tools/add-comment.test.ts`
- Modify: `tests/tools/edit-issue.test.ts`

**Interfaces:**
- Consumes: `markdownToAdf(markdown: string)` from `../markdown-to-adf.js`

- [ ] **Step 1: Write failing test for createIssue with markdown description**

Add to `tests/tools/create-issue.test.ts` after the existing tests:

```typescript
  it("converts markdown description to ADF with proper structure", async () => {
    fetchSpy.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({ id: "10044", key: "TEST-44", self: "https://..." }),
    });

    const { handleCreateIssue } = await import(
      "../../src/tools/create-issue.js"
    );
    await handleCreateIssue(client, {
      projectKey: "TEST",
      issueType: "Task",
      summary: "Task with markdown",
      description: "## Overview\n\n- item one\n- item two",
    });

    const [, opts] = fetchSpy.mock.calls[0];
    const body = JSON.parse(opts.body);
    const desc = body.fields.description;
    expect(desc.type).toBe("doc");
    expect(desc.version).toBe(1);
    expect(desc.content[0].type).toBe("heading");
    expect(desc.content[1].type).toBe("bulletList");
  });
```

- [ ] **Step 2: Write failing test for addComment with markdown body**

Add to `tests/tools/add-comment.test.ts` after the existing test:

```typescript
  it("converts markdown body to ADF with rich structure", async () => {
    fetchSpy.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({ id: "10501", self: "https://..." }),
    });

    const { handleAddComment } = await import(
      "../../src/tools/add-comment.js"
    );
    await handleAddComment(client, {
      issueKey: "TEST-1",
      body: "**Important:** See the list\n\n1. Step one\n2. Step two",
    });

    const [, opts] = fetchSpy.mock.calls[0];
    const postBody = JSON.parse(opts.body);
    expect(postBody.body.type).toBe("doc");
    expect(postBody.body.content[0].type).toBe("paragraph");
    expect(postBody.body.content[1].type).toBe("orderedList");
  });
```

- [ ] **Step 3: Write failing test for editIssue description interception**

Add to `tests/tools/edit-issue.test.ts` after the existing test:

```typescript
  it("converts string description field to ADF, passes other fields through", async () => {
    fetchSpy.mockResolvedValueOnce({ ok: true, status: 204 });

    const { handleEditIssue } = await import("../../src/tools/edit-issue.js");
    await handleEditIssue(client, {
      issueKey: "TEST-1",
      fields: {
        summary: "Plain string stays as-is",
        description: "## New description\n\nWith **bold** text",
      },
    });

    const [, opts] = fetchSpy.mock.calls[0];
    const body = JSON.parse(opts.body);
    expect(body.fields.summary).toBe("Plain string stays as-is");
    expect(body.fields.description.type).toBe("doc");
    expect(body.fields.description.version).toBe(1);
    expect(body.fields.description.content[0].type).toBe("heading");
  });

  it("does not convert description when it is already an ADF object", async () => {
    fetchSpy.mockResolvedValueOnce({ ok: true, status: 204 });

    const adfObj = { type: "doc", version: 1, content: [] };
    const { handleEditIssue } = await import("../../src/tools/edit-issue.js");
    await handleEditIssue(client, {
      issueKey: "TEST-1",
      fields: { description: adfObj },
    });

    const [, opts] = fetchSpy.mock.calls[0];
    const body = JSON.parse(opts.body);
    expect(body.fields.description).toEqual(adfObj);
  });
```

- [ ] **Step 4: Run tests to verify they fail**

```bash
npx vitest run tests/tools/create-issue.test.ts tests/tools/add-comment.test.ts tests/tools/edit-issue.test.ts
```

Expected: New tests FAIL (old ones still pass).

- [ ] **Step 5: Update `src/tools/create-issue.ts`**

Change the import section — add:

```typescript
import { markdownToAdf } from "../markdown-to-adf.js";
```

Change the description schema `.describe()`:

```typescript
// Old:
.describe("Plain text description (converted to ADF automatically)")
// New:
.describe("Description (supports markdown formatting)")
```

Replace the ADF construction block (lines 31–42):

```typescript
  // Old:
  if (params.description) {
    fields.description = {
      type: "doc",
      version: 1,
      content: [
        {
          type: "paragraph",
          content: [{ type: "text", text: params.description }],
        },
      ],
    };
  }

  // New:
  if (params.description) {
    fields.description = markdownToAdf(params.description);
  }
```

- [ ] **Step 6: Update `src/tools/add-comment.ts`**

Change the import section — add:

```typescript
import { markdownToAdf } from "../markdown-to-adf.js";
```

Change the body schema `.describe()`:

```typescript
// Old:
.describe("Comment text (plain text, converted to ADF)")
// New:
.describe("Comment text (supports markdown formatting)")
```

Replace the ADF construction in `handleAddComment` (lines 13–21):

```typescript
  // Old:
  const adfBody = {
    type: "doc",
    version: 1,
    content: [
      {
        type: "paragraph",
        content: [{ type: "text", text: params.body }],
      },
    ],
  };

  // New:
  const adfBody = markdownToAdf(params.body);
```

- [ ] **Step 7: Update `src/tools/edit-issue.ts`**

Change the import section — add:

```typescript
import { markdownToAdf } from "../markdown-to-adf.js";
```

Update the tool description:

```typescript
// Old:
"Update fields on a Jira issue. Pass fields as {fieldName: value}. Returns {ok, key}."
// New:
"Update fields on a Jira issue. Pass fields as {fieldName: value}. Description field accepts markdown. Returns {ok, key}."
```

Add description interception before the PUT call in `handleEditIssue`:

```typescript
export async function handleEditIssue(
  client: AtlassianClient,
  params: Input
): Promise<string> {
  const fields = { ...params.fields };
  if (typeof fields.description === "string") {
    fields.description = markdownToAdf(fields.description);
  }

  await client.jiraPut(`/rest/api/3/issue/${params.issueKey}`, {
    fields,
  });

  return JSON.stringify({ ok: true, key: params.issueKey });
}
```

- [ ] **Step 8: Run tests to verify they pass**

```bash
npx vitest run tests/tools/create-issue.test.ts tests/tools/add-comment.test.ts tests/tools/edit-issue.test.ts
```

Expected: All tests PASS (old and new).

- [ ] **Step 9: Run full test suite**

```bash
npm test
```

Expected: All tests pass.

- [ ] **Step 10: Commit**

```bash
git add src/tools/create-issue.ts src/tools/add-comment.ts src/tools/edit-issue.ts tests/tools/create-issue.test.ts tests/tools/add-comment.test.ts tests/tools/edit-issue.test.ts
git commit -m "feat: Jira write tools accept markdown input"
```

---

### Task 3: Update Confluence write tools and finalize

**Files:**
- Modify: `src/tools/create-article.ts:9-10`
- Modify: `src/tools/update-article.ts:8`
- Modify: `tests/tools/create-article.test.ts`
- Modify: `tests/tools/update-article.test.ts`
- Modify: `CLAUDE.md`

**Interfaces:**
- Consumes: `markdownToStorage(markdown: string)` from `../markdown-to-adf.js`

- [ ] **Step 1: Write failing test for createArticle with markdown body**

Add to `tests/tools/create-article.test.ts` after the existing test:

```typescript
  it("converts markdown body to XHTML storage format", async () => {
    fetchSpy.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          id: "67891",
          title: "MD Article",
          _links: { webui: "/spaces/KB/pages/67891" },
        }),
    });

    const { handleCreateArticle } = await import(
      "../../src/tools/create-article.js"
    );
    await handleCreateArticle(client, {
      spaceId: "123456",
      title: "MD Article",
      body: "## Introduction\n\nSome **bold** text",
    });

    const [, opts] = fetchSpy.mock.calls[0];
    const reqBody = JSON.parse(opts.body);
    expect(reqBody.body.value).toContain("<h2>");
    expect(reqBody.body.value).toContain("<strong>bold</strong>");
    expect(reqBody.body.representation).toBe("storage");
  });
```

- [ ] **Step 2: Write failing test for updateArticle with markdown body**

Add to `tests/tools/update-article.test.ts` after the existing test:

```typescript
  it("converts markdown body to XHTML storage format", async () => {
    fetchSpy.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          id: "12345",
          title: "Updated",
          version: { number: 5 },
        }),
    });

    const { handleUpdateArticle } = await import(
      "../../src/tools/update-article.js"
    );
    await handleUpdateArticle(client, {
      pageId: "12345",
      title: "Updated",
      body: "- bullet one\n- bullet two",
      version: 4,
    });

    const [, opts] = fetchSpy.mock.calls[0];
    const reqBody = JSON.parse(opts.body);
    expect(reqBody.body.value).toContain("<ul>");
    expect(reqBody.body.value).toContain("<li>");
    expect(reqBody.body.representation).toBe("storage");
  });
```

- [ ] **Step 3: Run tests to verify they fail**

```bash
npx vitest run tests/tools/create-article.test.ts tests/tools/update-article.test.ts
```

Expected: New tests FAIL (markdown not converted yet, raw markdown string sent as `body.value`).

- [ ] **Step 4: Update `src/tools/create-article.ts`**

Add import:

```typescript
import { markdownToStorage } from "../markdown-to-adf.js";
```

Change the body schema `.describe()`:

```typescript
// Old:
.describe("Page body content (plain text or HTML)")
// New:
.describe("Page body content (supports markdown formatting)")
```

Wrap `params.body` with conversion in `handleCreateArticle`:

```typescript
  // Old:
  body: {
    representation: "storage",
    value: params.body,
  },

  // New:
  body: {
    representation: "storage",
    value: markdownToStorage(params.body),
  },
```

- [ ] **Step 5: Update `src/tools/update-article.ts`**

Add import:

```typescript
import { markdownToStorage } from "../markdown-to-adf.js";
```

Change the body schema `.describe()`:

```typescript
// Old:
.describe("Updated page body content")
// New:
.describe("Updated page body content (supports markdown formatting)")
```

Wrap `params.body` with conversion:

```typescript
  // Old:
  body: {
    representation: "storage",
    value: params.body,
  },

  // New:
  body: {
    representation: "storage",
    value: markdownToStorage(params.body),
  },
```

- [ ] **Step 6: Run tests to verify they pass**

```bash
npx vitest run tests/tools/create-article.test.ts tests/tools/update-article.test.ts
```

Expected: All tests PASS.

- [ ] **Step 7: Run full test suite**

```bash
npm test
```

Expected: All tests pass.

- [ ] **Step 8: Update CLAUDE.md**

In the Architecture section, after the `adf-to-markdown.ts` entry, add:

```
├── markdown-to-adf.ts        # Markdown → ADF (Jira) & XHTML storage (Confluence) converter
```

In the Key Design Principles section, add a bullet:

```
- **Markdown input.** Write tools accept markdown-formatted text and convert it to the appropriate format (ADF for Jira, XHTML storage for Confluence) server-side.
```

- [ ] **Step 9: Type-check and final test**

```bash
npx tsc --noEmit && npm test
```

Expected: No type errors, all tests pass.

- [ ] **Step 10: Commit**

```bash
git add src/tools/create-article.ts src/tools/update-article.ts tests/tools/create-article.test.ts tests/tools/update-article.test.ts CLAUDE.md
git commit -m "feat: Confluence write tools accept markdown input"
```
