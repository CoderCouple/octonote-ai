/**
 * One-line plain-text preview of a note's markdown for list rows: strips
 * headings, list/checkbox markers, emphasis, code and link syntax, and drops a
 * leading line that just repeats the title.
 */
export function previewFromMarkdown(md: string, title?: string, max = 140): string {
  const lines = md
    .replace(/```[\s\S]*?```/g, " ")
    .split("\n")
    .map((line) =>
      line
        .replace(/^\s{0,3}#{1,6}\s+/, "")
        .replace(/^\s*>\s?/, "")
        .replace(/^\s*(?:[-*+]|\d+[.)])\s+(?:\[[ xX]\]\s+)?/, "")
        .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
        .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
        .replace(/(\*\*|__|\*|_|~~|`)/g, "")
        .trim(),
    )
    .filter(Boolean);
  if (title && lines[0]?.toLowerCase() === title.trim().toLowerCase()) lines.shift();
  const text = lines.join(" · ");
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;
}

/** Minutes to read a note's markdown at 220 words a minute (at least 1). */
export function readingMinutes(md: string): number {
  const words = md ? md.trim().split(/\s+/).filter(Boolean).length : 0;
  return Math.max(1, Math.ceil(words / 220));
}

/**
 * The first image in a note's markdown (`![alt](url)` or `<img src>`), for
 * card thumbnails; http(s) only, never inside code blocks. Null when none.
 */
export function firstImageUrl(md: string): string | null {
  const text = md.replace(/```[\s\S]*?```/g, " ");
  const m = /!\[[^\]]*\]\(\s*<?([^)\s>]+)>?(?:\s+["'][^"']*["'])?\s*\)|<img\b[^>]*\bsrc=["']([^"']+)["']/i.exec(text);
  const url = m?.[1] ?? m?.[2];
  return url && /^https?:\/\//i.test(url) ? url : null;
}
