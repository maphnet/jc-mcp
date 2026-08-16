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
