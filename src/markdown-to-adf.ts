import { markdownToAdf as marklassianToAdf } from "marklassian";
import MarkdownIt from "markdown-it";
import { marked } from "marked";

const md = new MarkdownIt({ xhtmlOut: true });

// marklassian lexes with the shared marked instance. Strike only on "~~", and
// keep non-autolink "<...>" as literal text (marklassian drops inline html).
marked.use({
  tokenizer: {
    del(src: string) {
      return src.startsWith("~~") ? false : (undefined as any);
    },
    tag() {
      return undefined as any;
    },
  },
});

// Jira allows only inline content in a taskItem: hoist nested taskLists to
// be siblings of the item inside the parent taskList.
function hoistNestedTaskLists(node: any): void {
  if (!node || !Array.isArray(node.content)) return;
  node.content.forEach(hoistNestedTaskLists);
  if (node.type !== "taskList") return;
  node.content = node.content.flatMap((item: any) => {
    if (item.type !== "taskItem") return [item];
    const nested = item.content.filter((c: any) => c.type === "taskList");
    item.content = item.content.filter((c: any) => c.type !== "taskList");
    return [item, ...nested];
  });
}

export function markdownToAdf(markdown: string): {
  version: 1;
  type: "doc";
  content: any[];
} {
  const adf = marklassianToAdf(markdown);
  hoistNestedTaskLists(adf);
  return adf;
}

export function markdownToStorage(markdown: string): string {
  return md.render(markdown);
}
