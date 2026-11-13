/**
 * The text that goes into a chat when you insert something from Octonote:
 * clearly marked as coming from your notes, with a link back, and cut at a
 * paragraph boundary when it's longer than chats handle well.
 */
import type { ClipRow } from "./messages";

/** Inserts longer than this are offered as "the first part" (chats get slow or refuse beyond it). */
export const INSERT_LIMIT = 30_000;

export type ItemKind = "note" | "canvas" | "project";

export interface ItemContent {
  id: string;
  kind: ItemKind;
  title: string;
  url: string;
  markdown: string;
  chars: number;
  hasImage: boolean;
}

const APP_NAMES: Record<string, string> = {
  chatgpt: "ChatGPT",
  claude: "Claude",
  gemini: "Gemini",
  octonote: "Octonote",
  web: "the web",
  other: "elsewhere",
};

/** The first `limit` characters, ending at a paragraph (else line, else word) break. */
export function firstPart(text: string, limit = INSERT_LIMIT): string {
  if (text.length <= limit) return text;
  const cut = text.slice(0, limit);
  // Prefer the latest break that still keeps most of the text.
  const floor = limit * 0.6;
  let end = cut.lastIndexOf("\n\n");
  if (end < floor) end = cut.lastIndexOf("\n");
  if (end < floor) end = cut.lastIndexOf(" ");
  if (end < floor) end = limit;
  let part = cut.slice(0, end);
  // Don't leave a code block open: end before the unfinished one.
  if ((part.match(/^```/gm) ?? []).length % 2 === 1) part = part.slice(0, part.lastIndexOf("```"));
  return part.trimEnd();
}

const quote = (s: string) => `“${s.replace(/[“”]/g, '"')}”`;

export function formatItem(item: ItemContent, options: { whole?: boolean; withImage?: boolean } = {}): string {
  const body = options.whole ? item.markdown : firstPart(item.markdown);
  const shortened = body.length < item.markdown.length;
  const name = quote(item.title || "Untitled");
  const intro =
    item.kind === "canvas"
      ? options.withImage
        ? `From my Octonote canvas ${name} (${item.url}). The attached image shows the canvas; here is its diagram as Mermaid:`
        : `From my Octonote canvas ${name} (${item.url}), as a Mermaid diagram:`
      : item.kind === "project"
        ? `From my Octonote project ${name} (${item.url})${options.withImage ? "; the attached image shows its canvas" : ""}:`
        : `From my Octonote note ${name} (${item.url}):`;
  const end = shortened
    ? `[Shortened: this is the first ${body.length.toLocaleString("en")} of ${item.markdown.length.toLocaleString("en")} characters. Full ${item.kind}: ${item.url}]`
    : `[End of ${name}]`;
  return `${intro}\n\n${body}\n\n${end}`;
}

export function formatClips(collectionName: string, clips: ClipRow[], options: { whole?: boolean } = {}): string {
  const blocks = clips.map((clip, i) => {
    const s = clip.source;
    const from = [`From ${APP_NAMES[s?.app ?? "other"] ?? "elsewhere"}`, s?.title ? quote(s.title) : "", s?.url ? `(${s.url})` : ""]
      .filter(Boolean)
      .join(" ");
    return `[${i + 1}] ${from}\n${clip.content}`;
  });
  const all = blocks.join("\n\n");
  const body = options.whole ? all : firstPart(all);
  const shortened = body.length < all.length;
  return `Clips I collected in Octonote for ${quote(collectionName)}:\n\n${body}${shortened ? `\n\n[Shortened: the first ${body.length.toLocaleString("en")} of ${all.length.toLocaleString("en")} characters.]` : ""}`;
}

export const clipsLength = (clips: ClipRow[]) => clips.reduce((n, c) => n + c.content.length + 80, 0);
