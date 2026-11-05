import { describe, it, expect } from "vitest";
import { adfToMarkdown, storageToMarkdown } from "../src/adf-to-markdown.js";
import { markdownToStorage } from "../src/markdown-to-adf.js";

describe("adfToMarkdown", () => {
  it("converts a simple paragraph", () => {
    const adf = {
      type: "doc",
      version: 1,
      content: [
        {
          type: "paragraph",
          content: [{ type: "text", text: "Hello world" }],
        },
      ],
    };
    expect(adfToMarkdown(adf)).toBe("Hello world");
  });

  it("converts headings", () => {
    const adf = {
      type: "doc",
      version: 1,
      content: [
        {
          type: "heading",
          attrs: { level: 2 },
          content: [{ type: "text", text: "Title" }],
        },
      ],
    };
    expect(adfToMarkdown(adf)).toBe("## Title");
  });

  it("converts bold and italic marks", () => {
    const adf = {
      type: "doc",
      version: 1,
      content: [
        {
          type: "paragraph",
          content: [
            {
              type: "text",
              text: "bold",
              marks: [{ type: "strong" }],
            },
            { type: "text", text: " and " },
            {
              type: "text",
              text: "italic",
              marks: [{ type: "em" }],
            },
          ],
        },
      ],
    };
    expect(adfToMarkdown(adf)).toBe("**bold** and *italic*");
  });

  it("converts bullet lists", () => {
    const adf = {
      type: "doc",
      version: 1,
      content: [
        {
          type: "bulletList",
          content: [
            {
              type: "listItem",
              content: [
                {
                  type: "paragraph",
                  content: [{ type: "text", text: "Item 1" }],
                },
              ],
            },
            {
              type: "listItem",
              content: [
                {
                  type: "paragraph",
                  content: [{ type: "text", text: "Item 2" }],
                },
              ],
            },
          ],
        },
      ],
    };
    expect(adfToMarkdown(adf)).toBe("- Item 1\n- Item 2");
  });

  it("converts ordered lists", () => {
    const adf = {
      type: "doc",
      version: 1,
      content: [
        {
          type: "orderedList",
          content: [
            {
              type: "listItem",
              content: [
                {
                  type: "paragraph",
                  content: [{ type: "text", text: "First" }],
                },
              ],
            },
            {
              type: "listItem",
              content: [
                {
                  type: "paragraph",
                  content: [{ type: "text", text: "Second" }],
                },
              ],
            },
          ],
        },
      ],
    };
    expect(adfToMarkdown(adf)).toBe("1. First\n2. Second");
  });

  it("converts code blocks", () => {
    const adf = {
      type: "doc",
      version: 1,
      content: [
        {
          type: "codeBlock",
          attrs: { language: "typescript" },
          content: [{ type: "text", text: "const x = 1;" }],
        },
      ],
    };
    expect(adfToMarkdown(adf)).toBe("```typescript\nconst x = 1;\n```");
  });

  it("converts inline code marks", () => {
    const adf = {
      type: "doc",
      version: 1,
      content: [
        {
          type: "paragraph",
          content: [
            { type: "text", text: "Use " },
            {
              type: "text",
              text: "npm install",
              marks: [{ type: "code" }],
            },
          ],
        },
      ],
    };
    expect(adfToMarkdown(adf)).toBe("Use `npm install`");
  });

  it("converts links", () => {
    const adf = {
      type: "doc",
      version: 1,
      content: [
        {
          type: "paragraph",
          content: [
            {
              type: "text",
              text: "click here",
              marks: [{ type: "link", attrs: { href: "https://example.com" } }],
            },
          ],
        },
      ],
    };
    expect(adfToMarkdown(adf)).toBe("[click here](https://example.com)");
  });

  it("converts blockquotes", () => {
    const adf = {
      type: "doc",
      version: 1,
      content: [
        {
          type: "blockquote",
          content: [
            {
              type: "paragraph",
              content: [{ type: "text", text: "Quoted text" }],
            },
          ],
        },
      ],
    };
    expect(adfToMarkdown(adf)).toBe("> Quoted text");
  });

  it("converts horizontal rules", () => {
    const adf = {
      type: "doc",
      version: 1,
      content: [
        {
          type: "paragraph",
          content: [{ type: "text", text: "Before" }],
        },
        { type: "rule" },
        {
          type: "paragraph",
          content: [{ type: "text", text: "After" }],
        },
      ],
    };
    expect(adfToMarkdown(adf)).toBe("Before\n\n---\n\nAfter");
  });

  it("converts mentions to display text", () => {
    const adf = {
      type: "doc",
      version: 1,
      content: [
        {
          type: "paragraph",
          content: [
            { type: "text", text: "Assigned to " },
            {
              type: "mention",
              attrs: { id: "abc123", text: "@John Doe" },
            },
          ],
        },
      ],
    };
    expect(adfToMarkdown(adf)).toBe("Assigned to @John Doe");
  });

  it("handles hardBreak", () => {
    const adf = {
      type: "doc",
      version: 1,
      content: [
        {
          type: "paragraph",
          content: [
            { type: "text", text: "Line 1" },
            { type: "hardBreak" },
            { type: "text", text: "Line 2" },
          ],
        },
      ],
    };
    expect(adfToMarkdown(adf)).toBe("Line 1\nLine 2");
  });

  it("returns empty string for null/undefined input", () => {
    expect(adfToMarkdown(null as any)).toBe("");
    expect(adfToMarkdown(undefined as any)).toBe("");
  });
});

describe("storageToMarkdown", () => {
  it("handles multiline content inside tags (dotAll)", () => {
    const html = "<p>Line 1\nLine 2</p>";
    const result = storageToMarkdown(html);
    expect(result).toContain("Line 1");
    expect(result).toContain("Line 2");
  });

  it("converts ordered lists with numbered prefixes", () => {
    const html = "<ol><li>First</li><li>Second</li><li>Third</li></ol>";
    const result = storageToMarkdown(html);
    expect(result).toContain("1. First");
    expect(result).toContain("2. Second");
    expect(result).toContain("3. Third");
  });

  it("converts unordered lists with dash prefixes", () => {
    const html = "<ul><li>Alpha</li><li>Beta</li></ul>";
    const result = storageToMarkdown(html);
    expect(result).toContain("- Alpha");
    expect(result).toContain("- Beta");
  });
});

describe("adfToMarkdown task lists", () => {
  const item = (state: string, text: string) => ({
    type: "taskItem",
    attrs: { localId: text, state },
    content: [{ type: "text", text }],
  });

  it("renders TODO, DONE and nested task items", () => {
    const adf = {
      type: "doc",
      version: 1,
      content: [
        { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "AC" }] },
        {
          type: "taskList",
          attrs: { localId: "l" },
          content: [
            item("TODO", "one"),
            item("DONE", "two"),
            { type: "taskList", attrs: { localId: "n" }, content: [item("TODO", "nested")] },
          ],
        },
      ],
    };
    expect(adfToMarkdown(adf)).toBe(
      "## AC\n\n- [ ] one\n- [x] two\n  - [ ] nested"
    );
  });

  it("renders task lists nested inside a taskItem (writer shape)", () => {
    const adf = {
      type: "doc",
      version: 1,
      content: [
        {
          type: "taskList",
          content: [
            {
              type: "taskItem",
              attrs: { state: "DONE" },
              content: [
                { type: "text", text: "b" },
                { type: "taskList", content: [item("TODO", "c")] },
              ],
            },
          ],
        },
      ],
    };
    expect(adfToMarkdown(adf)).toBe("- [x] b\n  - [ ] c");
  });

  it("indents continuation lines of a multi-line task item", () => {
    const adf = {
      type: "doc",
      version: 1,
      content: [
        {
          type: "taskList",
          content: [
            {
              type: "taskItem",
              attrs: { state: "TODO" },
              content: [
                { type: "text", text: "first" },
                { type: "hardBreak" },
                { type: "hardBreak" },
                { type: "text", text: "# not a heading" },
              ],
            },
            item("TODO", "next"),
          ],
        },
      ],
    };
    expect(adfToMarkdown(adf)).toBe("- [ ] first\n\n  # not a heading\n- [ ] next");
  });
});

describe("storageToMarkdown tables", () => {
  it("converts editor markup with attributes, colgroup, thead, p, empty and short rows", () => {
    const html =
      '<table class="x"><colgroup><col /><col /></colgroup><thead><tr><th><p>A</p></th><th colspan="1">B</th></tr></thead>' +
      '<tbody><tr><td><p>1</p></td><td></td></tr><tr><td>only</td></tr></tbody></table>';
    expect(storageToMarkdown(html)).toBe("| A | B |\n| --- | --- |\n| 1 |  |\n| only |  |");
  });

  it("pads short rows to the widest row", () => {
    const html = "<table><tr><td>a</td></tr><tr><td>b</td><td>c</td><td>d</td></tr></table>";
    expect(storageToMarkdown(html)).toBe("| a |  |  |\n| --- | --- | --- |\n| b | c | d |");
  });

  it("escapes pipes, including in code, and joins p/br with a space", () => {
    const html =
      "<table><tr><th>h</th></tr><tr><td><p>a|b</p><p>c</p>d<br/>e <code>x|y</code></td></tr></table>";
    expect(storageToMarkdown(html)).toBe("| h |\n| --- |\n| a\\|b c d e `x\\|y` |");
  });

  it("separates list items, divs and headings inside a cell", () => {
    const html =
      "<table><tr><th>h</th></tr><tr><td><ul><li>a</li><li>b</li></ul><div>c</div><h2>d</h2></td></tr></table>";
    expect(storageToMarkdown(html)).toBe("| h |\n| --- |\n| a b c d |");
  });

  it("converts inline formatting in cells and keeps surrounding text", () => {
    const html =
      '<p>before</p><table><tr><th>h</th></tr><tr><td><strong>b</strong> <em>i</em> <a href="http://u">l</a></td></tr></table><p>after</p>';
    expect(storageToMarkdown(html)).toBe(
      "before\n\n| h |\n| --- |\n| **b** *i* [l](http://u) |\n\nafter",
    );
  });

  it("round-trips a markdown table through markdownToStorage", () => {
    const md = "| A | B |\n| --- | --- |\n| **x** | `a\\|b` |\n| 1 |  |";
    expect(storageToMarkdown(markdownToStorage(md))).toBe(md);
  });
});
