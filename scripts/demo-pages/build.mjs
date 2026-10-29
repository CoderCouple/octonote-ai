// Builders for demo content: BlockNote blocks (+ markdown) for the note and a
// validated octodraw canvas document (`{ version: 1, items }`). No DOM needed.
import { randomUUID } from "node:crypto";
import { isOctodrawDocument } from "../../packages/content/dist/index.js";

// ---------- note ----------

/** `**bold**`, `` `code` `` and `$math$` inside a line → BlockNote inline content. */
export function inline(src) {
  const out = [];
  const re = /\*\*(.+?)\*\*|`(.+?)`|\$(.+?)\$/g;
  let last = 0;
  for (const m of src.matchAll(re)) {
    if (m.index > last) out.push({ type: "text", text: src.slice(last, m.index), styles: {} });
    if (m[1] !== undefined) out.push({ type: "text", text: m[1], styles: { bold: true } });
    else if (m[2] !== undefined) out.push({ type: "text", text: m[2], styles: { code: true } });
    else out.push({ type: "math", props: { latex: m[3] } });
    last = m.index + m[0].length;
  }
  if (last < src.length) out.push({ type: "text", text: src.slice(last), styles: {} });
  return out;
}

// Every block gets an id, as the editor would save it: the published page's
// heading minimap and Contents sheet anchor to heading ids.
const block = (b) => ({ id: randomUUID(), ...b });

export const n = {
  h: (level, text) => block({ type: "heading", props: { level }, content: inline(text) }),
  p: (text) => block({ type: "paragraph", content: inline(text) }),
  bullet: (text) => block({ type: "bulletListItem", content: inline(text) }),
  num: (text) => block({ type: "numberedListItem", content: inline(text) }),
  todo: (text, checked = false) => block({ type: "checkListItem", props: { checked }, content: inline(text) }),
  quote: (text) => block({ type: "quote", content: inline(text) }),
  code: (language, code) => block({
    type: "codeBlock",
    props: { language },
    content: [{ type: "text", text: code.trim(), styles: {} }],
  }),
  math: (latex) => block({ type: "mathBlock", props: { latex: latex.trim() } }),
  mermaid: (code) => block({ type: "mermaid", props: { code: code.trim() } }),
};

/** Markdown twin of the blocks, for list previews and reading time (`contentMd`). */
export function toMarkdown(blocks) {
  const text = (content = []) =>
    content
      .map((c) =>
        c.type === "math"
          ? `$${c.props.latex}$`
          : c.styles?.bold
            ? `**${c.text}**`
            : c.styles?.code
              ? `\`${c.text}\``
              : c.text,
      )
      .join("");
  let num = 0;
  return blocks
    .map((b) => {
      num = b.type === "numberedListItem" ? num + 1 : 0;
      switch (b.type) {
        case "heading": return `${"#".repeat(b.props.level)} ${text(b.content)}`;
        case "bulletListItem": return `- ${text(b.content)}`;
        case "numberedListItem": return `${num}. ${text(b.content)}`;
        case "checkListItem": return `- [${b.props.checked ? "x" : " "}] ${text(b.content)}`;
        case "quote": return `> ${text(b.content)}`;
        case "codeBlock": return "```" + b.props.language + "\n" + b.content[0].text + "\n```";
        case "mathBlock": return `$$\n${b.props.latex}\n$$`;
        case "mermaid": return "```mermaid\n" + b.props.code + "\n```";
        default: return text(b.content);
      }
    })
    .join("\n\n");
}

// ---------- canvas ----------

/** Demo palette names → octodraw palette names (undefined = theme default ink). */
const COLORS = {
  black: undefined,
  grey: "gray",
  "light-violet": "violet",
  violet: "purple",
  blue: "blue",
  "light-blue": "lightblue",
  yellow: "yellow",
  orange: "orange",
  green: "green",
  "light-green": "lime",
  "light-red": "pink",
  red: "red",
  white: "#ffffff",
};
const colorOf = (name) => {
  if (name !== undefined && !(name in COLORS)) throw new Error(`unknown color "${name}"`);
  return COLORS[name];
};
/** Text sizes s/m/l/xl → octodraw's text presets. */
const TEXT_SIZES = { s: 14, m: 20, l: 32, xl: 48 };
const GROUP_LABEL_SIZE = 14;
const STICKY_SIZE = 200;
const textHeight = (text, size) => Math.ceil(Math.max(1, text.split("\n").length) * size * 1.3) + 2;
const SHAPES = new Set(["rectangle", "ellipse", "diamond"]);

/**
 * Small declarative canvas DSL:
 *   box(key, x, y, w, h, label, {color, geo})   geo: rectangle | ellipse | diamond
 *   group(key, x, y, w, h, label)               gray container, label top-left
 *   text(key, x, y, w, label, {size, color, align})
 *   sticky(key, x, y, label, {color})
 *   arrow(fromKey, toKey, label?, {dash, color})
 * Older style options (fill, labelColor, dash on boxes, align, bend, size on
 * boxes) are accepted and ignored: octodraw shapes centre their text and draw
 * straight, centre-aimed lines.
 */
export function canvas(build) {
  const shapes = [];
  const arrows = [];
  const byKey = new Map();
  const add = (item, isGroup = false) => {
    if (byKey.has(item.id)) throw new Error(`duplicate canvas key "${item.id}"`);
    shapes.push({ item, isGroup });
    byKey.set(item.id, item);
  };
  const withColor = (item, color) => {
    const c = colorOf(color);
    if (c) item.color = c;
    return item;
  };
  const api = {
    box(key, x, y, w, h, label, o = {}) {
      const shape = o.geo ?? "rectangle";
      if (!SHAPES.has(shape)) throw new Error(`box ${key}: unsupported geo "${shape}"`);
      const item = { id: key, type: "shape", shape, x, y, w, h };
      if (label) item.text = label;
      add(withColor(item, o.color));
      return api;
    },
    group(key, x, y, w, h, label) {
      // Container rectangle, its label as a small gray text inside the top-left corner.
      add(withColor({ id: key, type: "shape", shape: "rectangle", x, y, w, h }, "grey"), true);
      if (label) {
        add(withColor({
          id: `${key}-label`, type: "text",
          x: x + 12, y: y + 8, w: Math.max(24, w - 24), h: textHeight(label, GROUP_LABEL_SIZE),
          text: label, fontSize: GROUP_LABEL_SIZE,
        }, "grey"), true);
      }
      return api;
    },
    text(key, x, y, w, label, o = {}) {
      const fontSize = TEXT_SIZES[o.size ?? "s"];
      if (!fontSize) throw new Error(`text ${key}: unknown size "${o.size}"`);
      const item = { id: key, type: "text", x, y, w, h: textHeight(label, fontSize), text: label, fontSize };
      if (o.align === "middle") item.align = "center";
      else if (o.align === "end") item.align = "right";
      add(withColor(item, o.color));
      return api;
    },
    sticky(key, x, y, label, o = {}) {
      add(withColor({ id: key, type: "sticky", x, y, w: STICKY_SIZE, h: STICKY_SIZE, text: label }, o.color ?? "yellow"));
      return api;
    },
    arrow(from, to, label = "", o = {}) {
      arrows.push({ from, to, label, o });
      return api;
    },
  };
  build(api);

  const center = (s) => ({ x: s.x + s.w / 2, y: s.y + s.h / 2 });
  // Groups first so they sit behind their contents (later items draw on top).
  const items = [...shapes.filter((s) => s.isGroup), ...shapes.filter((s) => !s.isGroup)].map((s) => s.item);

  arrows.forEach((a, i) => {
    const from = byKey.get(a.from);
    const to = byKey.get(a.to);
    if (!from || !to) throw new Error(`arrow ${a.from}→${a.to}: unknown shape`);
    const c1 = center(from);
    const c2 = center(to);
    const line = {
      id: `arrow-${i}`,
      type: "line",
      x: Math.min(c1.x, c2.x),
      y: Math.min(c1.y, c2.y),
      w: Math.abs(c2.x - c1.x),
      h: Math.abs(c2.y - c1.y),
      start: { ...c1, item: from.id },
      end: { ...c2, item: to.id },
      endArrow: true,
    };
    if (a.o.dash === "dashed" || a.o.dash === "dotted") line.dashed = true;
    if (a.label) line.text = a.label;
    items.push(withColor(line, a.o.color));
  });

  const doc = { version: 1, items };
  validate(doc);
  return doc;
}

/** octodraw's loose document check plus a structural pass, so a bad item fails here, not in the browser. */
function validate(doc) {
  if (!isOctodrawDocument(doc)) throw new Error("not an octodraw canvas document");
  const ids = new Set();
  const finite = (v) => typeof v === "number" && Number.isFinite(v);
  for (const it of doc.items) {
    const where = `item ${it.id}`;
    if (typeof it.id !== "string" || !it.id) throw new Error("item without an id");
    if (ids.has(it.id)) throw new Error(`${where}: duplicate id`);
    ids.add(it.id);
    for (const k of ["x", "y", "w", "h"]) if (!finite(it[k])) throw new Error(`${where}: ${k} is not a number`);
    if (it.color !== undefined && typeof it.color !== "string") throw new Error(`${where}: bad color`);
    switch (it.type) {
      case "shape":
        if (!SHAPES.has(it.shape)) throw new Error(`${where}: bad shape`);
        if (it.text !== undefined && typeof it.text !== "string") throw new Error(`${where}: bad text`);
        break;
      case "text":
        if (typeof it.text !== "string" || !finite(it.fontSize)) throw new Error(`${where}: bad text item`);
        break;
      case "sticky":
        if (typeof it.text !== "string") throw new Error(`${where}: bad sticky`);
        break;
      case "line":
        for (const end of [it.start, it.end]) {
          if (!end || !finite(end.x) || !finite(end.y)) throw new Error(`${where}: bad endpoint`);
        }
        break;
      default:
        throw new Error(`${where}: unexpected type "${it.type}"`);
    }
  }
  for (const it of doc.items) {
    if (it.type !== "line") continue;
    for (const end of [it.start, it.end]) {
      if (end.item !== undefined && (!ids.has(end.item) || end.item === it.id)) {
        throw new Error(`line ${it.id}: attached to unknown item "${end.item}"`);
      }
    }
  }
}
