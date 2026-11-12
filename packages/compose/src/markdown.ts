import type { ContentBlock } from "@octonote/widgets";

/**
 * Turns the Markdown a model writes into content blocks: headings, paragraphs,
 * lists, quotes and fenced code. Inline formatting (**bold**, `code`, links,
 * $math$) stays in the text and is rendered safely later. No HTML survives:
 * everything ends up as plain strings inside typed blocks.
 */
export function markdownToBlocks(markdown: string): ContentBlock[] {
  const blocks: ContentBlock[] = [];
  const lines = markdown.replace(/\r\n?/g, "\n").split("\n");
  let paragraph: string[] = [];
  let list: { ordered: boolean; items: string[] } | null = null;
  let quote: string[] = [];

  const flush = () => {
    if (paragraph.length) blocks.push({ type: "paragraph", text: clip(paragraph.join(" ")) });
    if (list) blocks.push({ type: "list", ordered: list.ordered || undefined, items: list.items.slice(0, 50).map(clip) });
    if (quote.length) blocks.push({ type: "quote", text: clip(quote.join(" ")) });
    paragraph = [];
    list = null;
    quote = [];
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const trimmed = line.trim();
    const fence = /^```\s*([\w+-]*)/.exec(trimmed);
    if (fence) {
      flush();
      const body: string[] = [];
      for (i++; i < lines.length && !lines[i]!.trim().startsWith("```"); i++) body.push(lines[i]!);
      const code = body.join("\n");
      if (code.trim()) blocks.push({ type: "code", code: code.slice(0, 20_000), ...(fence[1] ? { language: fence[1].slice(0, 32) } : {}) });
      continue;
    }
    if (!trimmed) {
      flush();
      continue;
    }
    const heading = /^(#{1,6})\s+(.+)$/.exec(trimmed);
    if (heading) {
      flush();
      blocks.push({ type: "heading", level: Math.min(4, Math.max(2, heading[1]!.length + 1)) as 2 | 3 | 4, text: heading[2]!.replace(/[*_`]/g, "").slice(0, 200) });
      continue;
    }
    if (/^(-{3,}|\*{3,})$/.test(trimmed)) {
      flush();
      blocks.push({ type: "divider" });
      continue;
    }
    const item = /^(?:([-*+])|(\d+)[.)])\s+(.+)$/.exec(trimmed);
    if (item) {
      const ordered = item[2] !== undefined;
      if (paragraph.length || quote.length || (list && list.ordered !== ordered)) flush();
      list ??= { ordered, items: [] };
      list.items.push(item[3]!);
      continue;
    }
    if (trimmed.startsWith(">")) {
      if (paragraph.length || list) flush();
      quote.push(trimmed.replace(/^>\s?/, ""));
      continue;
    }
    if (list) {
      // A continuation line of the last list item.
      list.items[list.items.length - 1] += ` ${trimmed}`;
      continue;
    }
    if (quote.length) flush();
    paragraph.push(trimmed);
  }
  flush();
  return blocks;
}

const clip = (text: string) => text.slice(0, 4000);
