/**
 * Markdown for people in a terminal (`octonote note show` without --json):
 * headings stand out, checklists get boxes, code and diagrams are set apart,
 * links show their address. Small and dependency-free on purpose; agents
 * reading stdout through a pipe get the raw markdown as JSON instead.
 * Colour only when stdout is a terminal and NO_COLOR isn't set.
 */

const ESC = "\u001b[";
const style = (on: boolean) => ({
  bold: (s: string) => (on ? `${ESC}1m${s}${ESC}22m` : s),
  dim: (s: string) => (on ? `${ESC}2m${s}${ESC}22m` : s),
  italic: (s: string) => (on ? `${ESC}3m${s}${ESC}23m` : s),
  underline: (s: string) => (on ? `${ESC}4m${s}${ESC}24m` : s),
  cyan: (s: string) => (on ? `${ESC}36m${s}${ESC}39m` : s),
  green: (s: string) => (on ? `${ESC}32m${s}${ESC}39m` : s),
});

export function colorEnabled(): boolean {
  return Boolean(process.stdout.isTTY) && !process.env.NO_COLOR;
}

/** Inline marks: **bold**, *italic*, `code`, [text](url), $math$. */
function inline(text: string, s: ReturnType<typeof style>): string {
  return text
    .replace(/`([^`]+)`/g, (_, c: string) => s.cyan(c))
    .replace(/\*\*([^*]+)\*\*/g, (_, b: string) => s.bold(b))
    .replace(/(^|[^*\w])\*([^*\s][^*]*)\*(?!\w)/g, (_, pre: string, i: string) => `${pre}${s.italic(i)}`)
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, (_, t: string, u: string) => `${s.underline(t)} ${s.dim(`(${u})`)}`);
}

export function renderMarkdown(markdown: string, color = colorEnabled()): string {
  const s = style(color);
  const out: string[] = [];
  let fence: { lang: string } | null = null;

  for (const raw of markdown.replace(/\r\n?/g, "\n").split("\n")) {
    // A trailing backslash is a markdown hard line break; the newline already shows it.
    const line = raw.replace(/\s+$/, "").replace(/\\$/, "");
    const fenceMatch = line.match(/^\s*(```|~~~)\s*([\w-]*)/);
    if (fenceMatch) {
      if (!fence) {
        fence = { lang: fenceMatch[2]!.toLowerCase() };
        const label = fence.lang === "mermaid" ? "diagram (mermaid) — open the note to see it drawn" : fence.lang || "code";
        out.push(s.dim(`┌─ ${label}`));
      } else {
        fence = null;
        out.push(s.dim("└─"));
      }
      continue;
    }
    if (fence) {
      out.push(`${s.dim("│")} ${fence.lang === "mermaid" ? s.dim(line) : s.cyan(line)}`);
      continue;
    }

    const h = line.match(/^(#{1,6})\s+(.*)$/);
    if (h) {
      const text = inline(h[2]!, s);
      if (h[1]!.length === 1) out.push("", s.bold(s.underline(text)), "");
      else out.push("", s.bold(text));
      continue;
    }
    const task = line.match(/^(\s*)[-*+]\s+\[([ xX])\]\s+(.*)$/);
    if (task) {
      const done = task[2] !== " ";
      out.push(`${task[1]}${done ? s.green("☑") : "☐"} ${done ? s.dim(inline(task[3]!, s)) : inline(task[3]!, s)}`);
      continue;
    }
    const bullet = line.match(/^(\s*)[-*+]\s+(.*)$/);
    if (bullet) {
      out.push(`${bullet[1]}• ${inline(bullet[2]!, s)}`);
      continue;
    }
    const numbered = line.match(/^(\s*)(\d+)[.)]\s+(.*)$/);
    if (numbered) {
      out.push(`${numbered[1]}${numbered[2]}. ${inline(numbered[3]!, s)}`);
      continue;
    }
    const quote = line.match(/^>\s?(.*)$/);
    if (quote) {
      out.push(`${s.dim("│")} ${s.italic(inline(quote[1]!, s))}`);
      continue;
    }
    if (/^\s*([-*_])(\s*\1){2,}\s*$/.test(line)) {
      out.push(s.dim("─".repeat(40)));
      continue;
    }
    if (/^\|.*\|$/.test(line.trim())) {
      // Tables: keep the pipes, dim the separator row.
      out.push(/^\|[\s:|-]+\|$/.test(line.trim()) ? s.dim(line) : inline(line, s));
      continue;
    }
    out.push(inline(line, s));
  }
  // At most one blank line in a row, none at the start.
  return out.join("\n").replace(/\n{3,}/g, "\n\n").replace(/^\n+/, "");
}
