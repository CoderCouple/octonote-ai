/**
 * Canvases, projects and notebooks for people in a terminal, in the same style
 * as notes (terminal-markdown.ts). A canvas can't be drawn in text, so it prints
 * as an outline: each figure's structure, then the words and links on the board.
 */
import { box, sideBySide, stacked } from "./terminal-box.js";
import {
  bold,
  colorEnabled,
  dim,
  renderMarkdown,
  stripControl,
  terminalWidth,
  wrap,
} from "./terminal-markdown.js";

export interface CanvasOutline {
  /** How many of each kind of item, e.g. `{ figure: 2, shape: 5 }`. */
  counts: Record<string, number>;
  /** Diagram-as-code figures, top to bottom. */
  figures: { id: string; title: string; source: string }[];
  /** Words on the board, top to bottom: shapes, text, stickies, frames, code. */
  blocks: { type: string; text: string; language?: string }[];
  /** Arrows between labelled items. */
  connections: { from: string; to: string; label?: string }[];
}

interface RawItem {
  id: string;
  type: string;
  x?: number;
  y?: number;
  text?: string;
  title?: string;
  source?: string;
  language?: string;
  start?: { item?: string };
  end?: { item?: string };
}

const oneLine = (s: unknown) =>
  stripControl(String(s ?? "")).replace(/\s+/g, " ").trim();

/** Reduces a canvas document to what can be read as text. */
export function canvasOutline(document: unknown): CanvasOutline {
  const raw = (document as { items?: unknown } | null)?.items;
  const items = (Array.isArray(raw) ? (raw as RawItem[]) : [])
    .slice()
    .sort((a, b) => (a.y ?? 0) - (b.y ?? 0) || (a.x ?? 0) - (b.x ?? 0));
  const out: CanvasOutline = { counts: {}, figures: [], blocks: [], connections: [] };
  const labels = new Map<string, string>();
  for (const i of items) {
    out.counts[i.type] = (out.counts[i.type] ?? 0) + 1;
    if (i.type === "figure") {
      const source = stripControl(String(i.source ?? ""));
      const title = source.match(/^\s*title\s+(.+)$/m)?.[1]?.trim() ?? "";
      out.figures.push({ id: i.id, title, source });
      labels.set(i.id, title);
    } else if (i.type === "code") {
      const text = stripControl(String(i.text ?? "")).trimEnd();
      if (text) out.blocks.push({ type: "code", text, ...(i.language ? { language: i.language } : {}) });
    } else if (i.type !== "line") {
      const parts = stripControl(String((i.type === "frame" ? i.title : i.text) ?? ""))
        .split("\n")
        .map(oneLine)
        .filter(Boolean);
      if (parts.length) {
        // A box's first line is its name; the lines under it describe it.
        out.blocks.push({ type: i.type, text: i.type === "shape" ? parts.join(" — ") : parts.join(" ") });
        labels.set(i.id, parts[0]!);
      }
    }
  }
  for (const i of items) {
    if (i.type !== "line") continue;
    const from = labels.get(i.start?.item ?? "");
    const to = labels.get(i.end?.item ?? "");
    const label = oneLine(i.text);
    if (from && to) out.connections.push({ from, to, ...(label ? { label } : {}) });
  }
  return out;
}

const NOUNS: Record<string, [string, string]> = {
  figure: ["figure", "figures"],
  shape: ["shape", "shapes"],
  line: ["line", "lines"],
  text: ["text", "texts"],
  sticky: ["sticky note", "sticky notes"],
  frame: ["frame", "frames"],
  code: ["code block", "code blocks"],
  image: ["image", "images"],
  icon: ["icon", "icons"],
  pen: ["drawing", "drawings"],
};

const countLine = (counts: Record<string, number>) =>
  Object.entries(counts)
    .map(([type, n]) => `${n} ${(NOUNS[type] ?? [type, type])[n === 1 ? 0 : 1]}`)
    .join(" · ");

const ATTRS = /\s*\[((?:[^\]"]|"[^"]*")*)\]/g;
const attr = (attrs: string, name: string) =>
  attrs.match(new RegExp(`\\b${name}:\\s*(?:"([^"]*)"|([^,\\]]+))`))?.slice(1).find(Boolean)?.trim();

/**
 * A figure's source without its styling: colours and icons go, groups stay
 * nested, a node shows its label and description, arrows read as arrows.
 */
export function figureLines(source: string, color = colorEnabled()): string[] {
  const out: string[] = [];
  // Arrows name nodes by id; print the label the node itself shows.
  const labels = new Map<string, string>();
  for (const m of source.matchAll(/^\s*([^\[\n>]+?)\s*\[((?:[^\]"]|"[^"]*")*)\]/gm)) {
    const label = attr(m[2]!, "label");
    if (label) labels.set(m[1]!, label);
  }
  const named = (edge: string) => {
    const at = edge.indexOf(": ");
    const ends = at < 0 ? edge : edge.slice(0, at);
    return ends.replace(/[^,→↔—]+/g, (n) => n.replace(n.trim(), labels.get(n.trim()) ?? n.trim())) + (at < 0 ? "" : edge.slice(at));
  };
  for (const raw of source.split("\n")) {
    const line = raw.trimEnd();
    const code = line.trim();
    if (/^(title|direction|autoNumber|colorMode|styleMode|typeface|iconSet)\b/i.test(code) || /^[{}]$/.test(code)) continue;
    if (code.startsWith("//")) continue;
    if (!code) {
      if (out.length && out[out.length - 1] !== "") out.push("");
      continue;
    }
    const indent = line.slice(0, line.length - line.trimStart().length);
    if (/[^-<]>|--|<>/.test(code.replace(ATTRS, ""))) {
      const edge = code
        .replace(ATTRS, "")
        .replace(/\s*(<-->|<->|<>)\s*/g, " ↔ ")
        .replace(/\s*(-->|->|>)\s*/g, " → ")
        .replace(/\s*(--)\s*/g, " — ")
        .replace(/\s*:\s*/, ": ");
      out.push(indent + named(edge));
      continue;
    }
    const group = code.endsWith("{");
    const body = group ? code.slice(0, -1).trimEnd() : code;
    const attrs = [...body.matchAll(ATTRS)].map((m) => m[1]!).join(", ");
    const name = attr(attrs, "label") ?? body.replace(ATTRS, "");
    const note = attr(attrs, "description");
    out.push(`${indent}${group ? bold(name, color) : name}${note ? dim(` — ${note}`, color) : ""}`);
  }
  while (out[out.length - 1] === "") out.pop();
  return out;
}

/** A canvas as text, without its title or link. */
export function renderCanvasBody(document: unknown, color = colorEnabled(), width = terminalWidth()): string {
  const o = canvasOutline(document);
  const parts: string[] = [];
  if (Object.keys(o.counts).length === 0) return dim("Nothing on this canvas yet.", color);
  parts.push(dim(countLine(o.counts), color));
  for (const f of o.figures) {
    const lines = figureLines(f.source, color).flatMap((l) => {
      if (!l) return [""];
      const indent = l.match(/^ */)![0]!;
      return wrap(l.trimStart(), width, `  ${indent}`, `  ${indent}  `);
    });
    parts.push([bold(f.title || "Figure", color), ...lines].join("\n"));
  }
  const words = o.blocks.filter((b) => b.type !== "code");
  if (words.length)
    parts.push(
      [bold("On the board", color), ...words.flatMap((b) => wrap(b.text, width, "• ", "  "))].join("\n"),
    );
  for (const b of o.blocks.filter((x) => x.type === "code"))
    parts.push(renderMarkdown(`\`\`\`${b.language ?? ""}\n${b.text}\n\`\`\``, color, width));
  if (o.connections.length)
    parts.push(
      [
        bold("Connections", color),
        ...o.connections.flatMap((c) =>
          wrap(`${c.from} → ${c.to}${c.label ? dim(` (${c.label})`, color) : ""}`, width, "• ", "  "),
        ),
      ].join("\n"),
    );
  return parts.join("\n\n");
}

const heading = (title: string, color: boolean, width: number) =>
  wrap(bold(title.trim(), color, true), width).join("\n");

const letters = (s: string) => s.replace(/[^\p{L}\p{N}]+/gu, "").toLowerCase();

/** The note without an opening line that only repeats its title. */
function withoutTitle(title: string, markdown: string): string {
  const lines = markdown.replace(/\r\n?/g, "\n").split("\n");
  const first = lines.findIndex((l) => l.trim());
  if (first < 0 || letters(lines[first]!) !== letters(title)) return markdown;
  return lines.slice(first + 1).join("\n");
}

const noteBody = (title: string, markdown: string | null, color: boolean, width: number) => {
  const body = markdown ? withoutTitle(title, markdown) : "";
  return body.trim() ? renderMarkdown(body, color, width) : dim("The note is empty.", color);
};

/** A note in a box, its title in the top border. */
export function renderNote(title: string, markdown: string, color = colorEnabled(), width = terminalWidth()): string {
  return box(title, noteBody(title, markdown, color, width - 4), width, color);
}

/** A canvas in a box, its title in the top border. */
export function renderCanvas(title: string, document: unknown, color = colorEnabled(), width = terminalWidth()): string {
  return box(title, renderCanvasBody(document, color, width - 4), width, color);
}

/** Below this a split leaves both panes too thin to read. */
const MIN_SPLIT = 90;

/** A project in one box: note and canvas side by side, or stacked in a narrow window. */
export function renderProject(
  name: string,
  markdown: string | null,
  document: unknown,
  color = colorEnabled(),
  width = terminalWidth(180, 140),
): string {
  if (width < MIN_SPLIT) {
    const inner = width - 4;
    return stacked(
      name,
      { label: "Note", width: inner, text: noteBody(name, markdown, color, inner) },
      { label: "Canvas", width: inner, text: renderCanvasBody(document, color, inner) },
      width,
      color,
    );
  }
  const left = Math.round((width - 7) * 0.6);
  const right = width - 7 - left;
  return sideBySide(
    name,
    { label: "Note", width: left, text: noteBody(name, markdown, color, left) },
    { label: "Canvas", width: right, text: renderCanvasBody(document, color, right) },
    color,
  );
}

export interface NotebookEntry {
  kind: string;
  title: string;
  url: string;
  updatedAt?: string;
  published: boolean;
}

const GROUPS: [string, string][] = [
  ["note", "Notes"],
  ["canvas", "Canvases"],
  ["project", "Projects"],
];

/** A notebook: what's inside, by kind, newest first, titles linking to each item. */
export function renderNotebook(title: string, entries: NotebookEntry[], color = colorEnabled(), width = terminalWidth()): string {
  const cell = (s: string) => stripControl(s).replace(/\|/g, "\\|").replace(/[[\]]/g, "");
  const sections = GROUPS.flatMap(([kind, label]) => {
    const rows = entries
      .filter((e) => e.kind === kind)
      .sort((a, b) => (b.updatedAt ?? "").localeCompare(a.updatedAt ?? ""));
    if (rows.length === 0) return [];
    return [
      `## ${label} (${rows.length})`,
      "| Title | Updated | Public |",
      "| --- | --- | --- |",
      ...rows.map((e) => `| [${cell(e.title) || "Untitled"}](${e.url}) | ${(e.updatedAt ?? "").slice(0, 10)} | ${e.published ? "yes" : ""} |`),
      "",
    ];
  });
  return `${heading(title, color, width)}\n\n${
    sections.length ? renderMarkdown(sections.join("\n"), color, width) : dim("This notebook is empty.", color)
  }`;
}
