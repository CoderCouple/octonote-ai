/**
 * Markdown for people in a terminal (`octonote note show` without --json),
 * laid out the way Claude Code prints a plan: text wrapped to the window,
 * bullets and numbers with hanging indents, tables drawn with box lines,
 * headings, quotes and code set apart, links clickable (OSC 8) where the
 * terminal supports colour. Small and dependency-free on purpose; agents
 * reading stdout through a pipe get the raw markdown as JSON instead.
 * Colour only when stdout is a terminal and NO_COLOR isn't set.
 */

const ESC = "\u001b[";
const OSC = "\u001b]8;;";
const ST = "\u001b\\";
const style = (on: boolean) => ({
  bold: (s: string) => (on ? `${ESC}1m${s}${ESC}22m` : s),
  dim: (s: string) => (on ? `${ESC}2m${s}${ESC}22m` : s),
  italic: (s: string) => (on ? `${ESC}3m${s}${ESC}23m` : s),
  underline: (s: string) => (on ? `${ESC}4m${s}${ESC}24m` : s),
  cyan: (s: string) => (on ? `${ESC}36m${s}${ESC}39m` : s),
  blue: (s: string) => (on ? `${ESC}34m${s}${ESC}39m` : s),
  green: (s: string) => (on ? `${ESC}32m${s}${ESC}39m` : s),
});
type Style = ReturnType<typeof style>;

export const bold = (text: string, on: boolean, underlined = false) =>
  style(on).bold(underlined ? style(on).underline(text) : text);
export const dim = (text: string, on: boolean) => style(on).dim(text);

/** Other people's content must not be able to send escape codes to the terminal. */
export const stripControl = (text: string) =>
  // eslint-disable-next-line no-control-regex
  text.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]/g, "");

export function colorEnabled(): boolean {
  return Boolean(process.stdout.isTTY) && !process.env.NO_COLOR;
}

/** Text width to wrap at: the terminal's, capped so long lines stay readable. */
export function terminalWidth(max = 110, fallback = 100): number {
  const cols = process.stdout.isTTY ? process.stdout.columns : 0;
  return Math.max(40, Math.min(cols || fallback, max));
}

/** ANSI styles and OSC 8 link wrappers take no columns. */
// eslint-disable-next-line no-control-regex
const HIDDEN = /\u001b\[[0-9;]*m|\u001b\]8;;[^\u001b]*\u001b\\/g;
/** Emoji and East Asian wide characters take two columns in a terminal. */
const WIDE = /\p{Emoji_Presentation}|[\u1100-\u115F\u2E80-\uA4CF\uAC00-\uD7A3\uF900-\uFAFF\uFE30-\uFE4F\uFF00-\uFF60\uFFE0-\uFFE6]/u;
export const charWidth = (ch: string) => (WIDE.test(ch) ? 2 : ch.codePointAt(0) === 0xfe0f ? 0 : 1);
export const visible = (s: string) => [...s.replace(HIDDEN, "")].reduce((n, ch) => n + charWidth(ch), 0);

/**
 * Inline marks: **bold**, *italic*, `code`, [text](url) and bare URLs. With
 * `refs` (table cells without colour) a link shows its text and a number, and
 * its address is collected to list under the table.
 */
function inline(text: string, s: Style, color: boolean, refs?: string[]): string {
  // Links and code are rendered first and parked, so later marks don't touch them.
  const links: string[] = [];
  const park = (rendered: string) => `\u0000${links.push(rendered) - 1}\u0000`;
  const link = (label: string, url: string) => {
    if (color) return park(`${OSC}${url}${ST}${s.underline(s.blue(label))}${OSC}${ST}`);
    if (refs) return park(`${label === url ? "link" : label} [${refs.push(url)}]`);
    return park(label === url ? url : `${label} (${url})`);
  };
  return text
    // An image can't show here: its name, linked to the picture (without Octonote's figure tag).
    .replace(/!\[([^\]]*)\]\((https?:\/\/[^)\s]+)\)/g, (_, alt: string, u: string) => link(`▣ ${alt || "Image"}`, u.replace(/#octonote-figure=.*$/, "")))
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, (_, t: string, u: string) => link(t, u))
    .replace(/(^|[\s(])(https?:\/\/[^\s)]*[^\s).,;:!?])/g, (_, pre: string, u: string) => `${pre}${link(u, u)}`)
    .replace(/`([^`]+)`/g, (_, c: string) => park(s.cyan(c)))
    .replace(/\*\*([^*]+)\*\*/g, (_, b: string) => s.bold(b))
    // The note export italicises a link on its own and splits the text around it.
    .replace(/\*(\u0000\d+\u0000)\*/g, (_, l: string) => park(s.italic(l)))
    .replace(/(\u0000)\*(\s[^*]*[^*\s])\*/g, (_, pre: string, i: string) => `${pre}${s.italic(i)}`)
    .replace(/(^|[^*\w])\*([^*\s][^*]*)\*(?!\w)/g, (_, pre: string, i: string) => `${pre}${s.italic(i)}`)
    .replace(/\u0000(\d+)\u0000/g, (_, n: string) => links[Number(n)]!)
    .replace(/\u0000(\d+)\u0000/g, (_, n: string) => links[Number(n)]!);
}

/** Word-wraps styled text: the first line starts with `first`, the rest with `rest`. */
export function wrap(text: string, width: number, first = "", rest = first): string[] {
  const lines: string[] = [];
  let line = first;
  let len = visible(first);
  let empty = true;
  for (const word of text.split(/ +/)) {
    if (!word) continue;
    const w = visible(word);
    if (!empty && len + 1 + w > width) {
      lines.push(line);
      line = rest + word;
      len = visible(rest) + w;
    } else {
      line += (empty ? "" : " ") + word;
      len += (empty ? 0 : 1) + w;
    }
    empty = false;
  }
  lines.push(line);
  return lines;
}

/** A table cell as lines no wider than `width` (an over-long word is cut). */
function wrapCell(text: string, width: number): string[] {
  const out: string[] = [];
  for (const line of wrap(text, width)) {
    if (visible(line) <= width) out.push(line);
    else {
      const plain = line.replace(HIDDEN, "");
      for (let i = 0; i < plain.length; i += width) out.push(plain.slice(i, i + width));
    }
  }
  return out;
}

const pad = (s: string, width: number) => s + " ".repeat(Math.max(0, width - visible(s)));

/**
 * A markdown table drawn with box lines, its widest columns shrunk and wrapped
 * to fit. When any row wraps, thin lines separate the rows.
 */
function table(rows: string[][], width: number, s: Style): string[] {
  const cols = Math.max(...rows.map((r) => r.length));
  const cells = rows.map((r) => Array.from({ length: cols }, (_, i) => r[i] ?? ""));
  const widths = Array.from({ length: cols }, (_, c) => Math.max(3, ...cells.map((r) => visible(r[c]!))));
  const room = width - (3 * cols + 1);
  while (widths.reduce((a, b) => a + b, 0) > room) {
    const i = widths.indexOf(Math.max(...widths));
    if (widths[i]! <= 8) break;
    widths[i]!--;
  }
  const rule = (l: string, m: string, r: string) => s.dim(l + widths.map((w) => "─".repeat(w + 2)).join(m) + r);
  const wrapped = cells.map((row, ri) => row.map((cell, c) => wrapCell(ri === 0 ? s.bold(cell) : cell, widths[c]!)));
  const tall = wrapped.slice(1).some((row) => row.some((w) => w.length > 1));
  const out = [rule("┌", "┬", "┐")];
  wrapped.forEach((row, ri) => {
    if (ri === 1 || (ri > 1 && tall)) out.push(rule("├", "┼", "┤"));
    const height = Math.max(...row.map((w) => w.length));
    for (let k = 0; k < height; k++) {
      out.push(s.dim("│") + row.map((w, c) => ` ${pad(w[k] ?? "", widths[c]!)} `).join(s.dim("│")) + s.dim("│"));
    }
  });
  out.push(rule("└", "┴", "┘"));
  return out;
}

const TABLE_ROW = /^\s*\|.*\|\s*$/;
const TABLE_RULE = /^\s*\|[\s:|-]+\|\s*$/;
const splitRow = (line: string) =>
  line
    .trim()
    .replace(/^\||\|$/g, "")
    .split(/(?<!\\)\|/)
    .map((c) => c.trim().replace(/\\\|/g, "|"));

export function renderMarkdown(markdown: string, color = colorEnabled(), width = terminalWidth()): string {
  const s = style(color);
  const out: string[] = [];
  const lines = stripControl(markdown.replace(/\r\n?/g, "\n")).split("\n");
  let fence: { lang: string } | null = null;

  for (let i = 0; i < lines.length; i++) {
    // A trailing backslash is a markdown hard line break; the newline already shows it.
    const line = lines[i]!.replace(/\s+$/, "").replace(/\\$/, "");
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

    // A table: gather the whole block, then draw it.
    if (TABLE_ROW.test(line)) {
      const rows: string[][] = [];
      const refs: string[] = [];
      for (; i < lines.length && TABLE_ROW.test(lines[i]!); i++) {
        if (!TABLE_RULE.test(lines[i]!)) rows.push(splitRow(lines[i]!).map((c) => inline(c, s, color, refs)));
      }
      i--;
      out.push("", ...table(rows, width, s));
      out.push(...refs.flatMap((url, n) => wrap(s.dim(url), width, s.dim(`[${n + 1}] `), "    ")), "");
      continue;
    }

    const h = line.match(/^(#{1,6})\s+(.*)$/);
    if (h) {
      const text = inline(h[2]!, s, color);
      const level = h[1]!.length;
      if (level === 1) out.push("", ...wrap(s.bold(s.underline(text)), width), "");
      else if (level === 2) out.push("", ...wrap(s.bold(text), width), "");
      else out.push("", ...wrap(s.bold(text), width));
      continue;
    }
    const task = line.match(/^(\s*)[-*+]\s+\[([ xX])\]\s+(.*)$/);
    if (task) {
      const indent = " ".repeat(task[1]!.length);
      const done = task[2] !== " ";
      const text = inline(task[3]!, s, color);
      out.push(...wrap(done ? s.dim(text) : text, width, `${indent}${done ? s.green("☑") : "☐"} `, `${indent}  `));
      continue;
    }
    const bullet = line.match(/^(\s*)[-*+]\s+(.*)$/);
    if (bullet) {
      const indent = " ".repeat(bullet[1]!.length);
      out.push(...wrap(inline(bullet[2]!, s, color), width, `${indent}${indent ? "◦" : "•"} `, `${indent}  `));
      continue;
    }
    const numbered = line.match(/^(\s*)(\d+)[.)]\s+(.*)$/);
    if (numbered) {
      const indent = " ".repeat(numbered[1]!.length);
      const num = `${numbered[2]}. `;
      out.push(...wrap(inline(numbered[3]!, s, color), width, `${indent}${num}`, `${indent}${" ".repeat(num.length)}`));
      continue;
    }
    const quote = line.match(/^>\s?(.*)$/);
    if (quote) {
      out.push(...wrap(s.italic(inline(quote[1]!, s, color)), width, `${s.dim("│")} `));
      continue;
    }
    if (/^\s*([-*_])(\s*\1){2,}\s*$/.test(line)) {
      out.push("", s.dim("─".repeat(Math.min(width, 60))), "");
      continue;
    }
    if (!line.trim()) {
      out.push("");
      continue;
    }
    out.push(...wrap(inline(line, s, color), width));
  }
  // At most one blank line in a row, none at the start or end.
  return out.join("\n").replace(/\n{3,}/g, "\n\n").replace(/^\n+/, "").replace(/\n+$/, "");
}

/** An item's link under the rendered text, dimmed in a colour terminal. */
export const dimUrl = (url: string, color = colorEnabled()) => style(color).dim(url);
