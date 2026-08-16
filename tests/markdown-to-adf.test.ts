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
