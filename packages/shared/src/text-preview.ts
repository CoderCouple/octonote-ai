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
