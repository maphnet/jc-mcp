import { describe, it, expect } from "vitest";
import { adfToMarkdown, storageToMarkdown } from "../src/adf-to-markdown.js";

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
