interface AdfNode {
  type: string;
  version?: number;
  content?: AdfNode[];
  text?: string;
  attrs?: Record<string, unknown>;
  marks?: AdfMark[];
}

interface AdfMark {
  type: string;
  attrs?: Record<string, unknown>;
}

interface ConvertContext {
  listType?: "bullet" | "ordered";
  listIndex?: number;
  blockquote?: boolean;
}

export function adfToMarkdown(doc: AdfNode): string {
  if (!doc) return "";
  if (!doc.content) return "";
  return convertBlocks(doc.content, {}).trim();
}

function convertBlocks(nodes: AdfNode[], ctx: ConvertContext): string {
  const parts: string[] = [];

  for (const node of nodes) {
    const result = convertBlock(node, ctx);
    if (result !== null) {
      parts.push(result);
    }
  }

  return parts.join("\n\n");
}

function convertBlock(node: AdfNode, ctx: ConvertContext): string | null {
  switch (node.type) {
    case "paragraph":
      return convertInlines(node.content ?? []);

    case "heading": {
      const level = (node.attrs?.level as number) ?? 1;
      const prefix = "#".repeat(level);
      return `${prefix} ${convertInlines(node.content ?? [])}`;
    }

    case "bulletList":
      return (node.content ?? [])
        .map((item) => convertListItem(item, "bullet", 0))
        .join("\n");

    case "orderedList":
      return (node.content ?? [])
        .map((item, i) => convertListItem(item, "ordered", i + 1))
        .join("\n");

    case "listItem": {
      // Handled by bulletList/orderedList parent
      const inner = (node.content ?? [])
        .map((child) => convertBlock(child, ctx))
        .filter((s) => s !== null)
        .join("\n");
      return inner;
    }

    case "codeBlock": {
      const lang = (node.attrs?.language as string) ?? "";
      const code = (node.content ?? []).map((c) => c.text ?? "").join("");
      return `\`\`\`${lang}\n${code}\n\`\`\``;
    }

    case "blockquote": {
      const inner = convertBlocks(node.content ?? [], {
        ...ctx,
        blockquote: true,
      });
      return inner
        .split("\n")
        .map((line) => `> ${line}`)
        .join("\n");
    }

    case "rule":
      return "---";

    case "table":
      return convertTable(node);

    default:
      // Unknown block type — try to extract text content
      if (node.content) {
        return convertBlocks(node.content, ctx);
      }
      return null;
  }
}

function convertListItem(
  node: AdfNode,
  type: "bullet" | "ordered",
  index: number
): string {
  const prefix = type === "bullet" ? "-" : `${index}.`;
  const inner = (node.content ?? [])
    .map((child) => {
      if (child.type === "paragraph") {
        return convertInlines(child.content ?? []);
      }
      return convertBlock(child, {});
    })
    .filter((s) => s !== null)
    .join("\n");
  return `${prefix} ${inner}`;
}

function convertInlines(nodes: AdfNode[]): string {
  return nodes.map(convertInline).join("");
}

function convertInline(node: AdfNode): string {
  switch (node.type) {
    case "text": {
      let text = node.text ?? "";
      if (node.marks) {
        for (const mark of node.marks) {
          text = applyMark(text, mark);
        }
      }
      return text;
    }

    case "hardBreak":
      return "\n";

    case "mention":
      return (node.attrs?.text as string) ?? "";

    case "emoji":
      return (node.attrs?.shortName as string) ?? "";

    case "inlineCard":
      return (node.attrs?.url as string) ?? "";

    default:
      return node.text ?? "";
  }
}

function applyMark(text: string, mark: AdfMark): string {
  switch (mark.type) {
    case "strong":
      return `**${text}**`;
    case "em":
      return `*${text}*`;
    case "code":
      return `\`${text}\``;
    case "strike":
      return `~~${text}~~`;
    case "underline":
      // Markdown has no underline; use emphasis
      return `*${text}*`;
    case "link":
      return `[${text}](${mark.attrs?.href ?? ""})`;
    default:
      return text;
  }
}

/**
 * Convert Confluence storage format (XHTML) to simple markdown.
 * Handles common tags: p, strong, em, code, h1-h6, ul, ol, li, a, br.
 */
export function storageToMarkdown(html: string): string {
  if (!html) return "";

  let md = html;

  // Block elements — add newlines
  md = md.replace(/<h([1-6])[^>]*>(.*?)<\/h[1-6]>/gis, (_, level, content) => {
    return "#".repeat(Number(level)) + " " + stripTags(content);
  });

  // Paragraphs (before <br/> so block structure is preserved)
  md = md.replace(/<p[^>]*>(.*?)<\/p>/gis, "$1\n\n");

  // Bold
  md = md.replace(/<strong>(.*?)<\/strong>/gis, "**$1**");
  md = md.replace(/<b>(.*?)<\/b>/gis, "**$1**");

  // Italic
  md = md.replace(/<em>(.*?)<\/em>/gis, "*$1*");
  md = md.replace(/<i>(.*?)<\/i>/gis, "*$1*");

  // Inline code
  md = md.replace(/<code>(.*?)<\/code>/gis, "`$1`");

  // Links
  md = md.replace(/<a[^>]+href="([^"]*)"[^>]*>(.*?)<\/a>/gis, "[$2]($1)");

  // Line breaks
  md = md.replace(/<br\s*\/?>/gi, "\n");

  // Ordered list items (numbered prefixes)
  md = md.replace(/<ol[^>]*>(.*?)<\/ol>/gis, (_, inner) => {
    let index = 0;
    return inner.replace(/<li[^>]*>(.*?)<\/li>/gis, (_: string, content: string) => {
      index++;
      return `${index}. ${content}`;
    });
  });

  // Unordered list items
  md = md.replace(/<li[^>]*>(.*?)<\/li>/gis, "- $1");

  // Strip remaining tags
  md = stripTags(md);

  // Normalize whitespace
  md = md.replace(/\n{3,}/g, "\n\n").trim();

  return md;
}

function stripTags(html: string): string {
  return html.replace(/<[^>]+>/g, "");
}

function convertTable(node: AdfNode): string {
  const rows = node.content ?? [];
  if (rows.length === 0) return "";

  const tableData: string[][] = [];
  let isHeader = false;

  for (const row of rows) {
    const cells: string[] = [];
    for (const cell of row.content ?? []) {
      if (cell.type === "tableHeader") isHeader = true;
      const cellText = (cell.content ?? [])
        .map((child) => convertBlock(child, {}))
        .filter((s) => s !== null)
        .join(" ");
      cells.push(cellText);
    }
    tableData.push(cells);
  }

  if (tableData.length === 0) return "";

  const lines: string[] = [];
  lines.push("| " + tableData[0].join(" | ") + " |");

  if (isHeader || tableData.length > 1) {
    lines.push("| " + tableData[0].map(() => "---").join(" | ") + " |");
  }

  for (let i = 1; i < tableData.length; i++) {
    lines.push("| " + tableData[i].join(" | ") + " |");
  }

  return lines.join("\n");
}
