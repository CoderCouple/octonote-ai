/**
 * Bounding boxes for the terminal: one pane, or two side by side with a divider.
 * Text is cut to fit the pane, and styles and links are closed at each line's
 * end and reopened on the next, so they never bleed onto the borders.
 */
import { charWidth, dim, bold, stripControl, visible } from "./terminal-markdown.js";

const ESC = "\u001b[";
const OSC = "\u001b]8;;";
const ST = "\u001b\\";
// eslint-disable-next-line no-control-regex
const TOKEN = /(\u001b\[[0-9;]*m|\u001b\]8;;[^\u001b]*\u001b\\)/;

/** Which style codes each closing code ends. */
const CLOSES: Record<string, RegExp> = {
  "22": /^(1|2)$/,
  "23": /^3$/,
  "24": /^4$/,
  "39": /^3\d$/,
  "0": /./,
};

/** Fits styled lines to `width`, each line carrying its own styles. */
export function fitLines(lines: string[], width: number): string[] {
  const out: string[] = [];
  let styles: string[] = [];
  let link = "";
  const open = () => link + styles.map((c) => `${ESC}${c}m`).join("");
  const close = () => (styles.length ? `${ESC}0m` : "") + (link ? `${OSC}${ST}` : "");
  for (const line of lines) {
    let cur = open();
    let used = 0;
    for (const part of line.split(TOKEN)) {
      if (part.startsWith("\u001b]")) {
        link = part === `${OSC}${ST}` ? "" : part;
        cur += part;
      } else if (part.startsWith("\u001b[")) {
        const code = part.slice(2, -1);
        const closes = CLOSES[code];
        styles = closes ? styles.filter((c) => !closes.test(c)) : [...styles, code];
        cur += part;
      } else {
        for (const ch of part) {
          const w = charWidth(ch);
          if (used + w > width) {
            out.push(cur + close());
            cur = open();
            used = 0;
          }
          cur += ch;
          used += w;
        }
      }
    }
    out.push(cur + close());
  }
  return out;
}

const pad = (s: string, width: number) => s + " ".repeat(Math.max(0, width - visible(s)));

/** A title short enough for the top border. */
function fitTitle(title: string, width: number): string {
  const clean = stripControl(title).replace(/\s+/g, " ").trim();
  if (visible(clean) <= width) return clean;
  let out = "";
  for (const ch of clean) {
    if (visible(out) + charWidth(ch) > width - 1) break;
    out += ch;
  }
  return `${out}…`;
}

const toLines = (text: string) => text.split("\n");

/** Text in a box of `width` columns, its title in the top border. */
export function box(title: string, text: string, width: number, color: boolean): string {
  const inner = width - 4;
  const name = fitTitle(title, inner - 2);
  const top = `${dim("╭─", color)} ${bold(name, color)} ${dim(`${"─".repeat(Math.max(0, inner - visible(name) - 1))}╮`, color)}`;
  const side = dim("│", color);
  return [
    top,
    ...fitLines(toLines(text), inner).map((l) => `${side} ${pad(l, inner)} ${side}`),
    dim(`╰${"─".repeat(width - 2)}╯`, color),
  ].join("\n");
}

export interface Pane {
  label: string;
  width: number;
  text: string;
}

/** Two panes in one box, side by side with a divider. Their widths plus 7 make the box. */
export function sideBySide(title: string, left: Pane, right: Pane, color: boolean): string {
  const L = left.width;
  const R = right.width;
  const name = fitTitle(title, L - 2);
  const side = dim("│", color);
  const row = (a: string, b: string) => `${side} ${pad(a, L)} ${side} ${pad(b, R)} ${side}`;
  const a = fitLines(toLines(left.text), L);
  const b = fitLines(toLines(right.text), R);
  return [
    `${dim("╭─", color)} ${bold(name, color)} ${dim(`${"─".repeat(L - 1 - visible(name))}┬${"─".repeat(R + 2)}╮`, color)}`,
    row(bold(left.label, color), bold(right.label, color)),
    dim(`├${"─".repeat(L + 2)}┼${"─".repeat(R + 2)}┤`, color),
    ...Array.from({ length: Math.max(a.length, b.length) }, (_, i) => row(a[i] ?? "", b[i] ?? "")),
    dim(`╰${"─".repeat(L + 2)}┴${"─".repeat(R + 2)}╯`, color),
  ].join("\n");
}

/** Two panes in one box, one above the other, for windows too narrow to split. */
export function stacked(title: string, first: Pane, second: Pane, width: number, color: boolean): string {
  const inner = width - 4;
  const name = fitTitle(title, inner - 2);
  const side = dim("│", color);
  const rows = (text: string) => fitLines(toLines(text), inner).map((l) => `${side} ${pad(l, inner)} ${side}`);
  return [
    `${dim("╭─", color)} ${bold(name, color)} ${dim(`${"─".repeat(Math.max(0, inner - visible(name) - 1))}╮`, color)}`,
    ...rows(`${bold(first.label, color)}\n\n${first.text}`),
    dim(`├${"─".repeat(width - 2)}┤`, color),
    ...rows(`${bold(second.label, color)}\n\n${second.text}`),
    dim(`╰${"─".repeat(width - 2)}╯`, color),
  ].join("\n");
}
