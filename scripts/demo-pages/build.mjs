// Builders for demo content: BlockNote blocks (+ markdown) for the note and a
// validated tldraw store snapshot for the canvas. No DOM needed.
import { randomUUID } from "node:crypto";
import { tlschema, tlstore, tlutils } from "./tl.mjs";

const {
  createTLSchema,
  createShapeId,
  createBindingId,
  toRichText,
  DocumentRecordType,
  PageRecordType,
  TLDOCUMENT_ID,
} = tlschema;

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

const STYLE = { color: "black", labelColor: "black", dash: "solid", size: "s", font: "sans" };

/**
 * Small declarative canvas DSL:
 *   box(key, x, y, w, h, label, {fill, color, dash, geo, align, verticalAlign, size})
 *   group(key, x, y, w, h, label)       dashed container, label top-left
 *   text(key, x, y, w, label, {size, color, align})
 *   arrow(fromKey, toKey, label?, {dash, color, bend})
 */
export function canvas(build) {
  const shapes = [];
  const arrows = [];
  const byKey = new Map();
  const api = {
    box(key, x, y, w, h, label, o = {}) {
      const s = {
        key, x, y, w, h,
        type: "geo",
        props: {
          geo: o.geo ?? "rectangle",
          w, h,
          richText: toRichText(label),
          color: o.color ?? STYLE.color,
          labelColor: o.labelColor ?? o.color ?? STYLE.labelColor,
          fill: o.fill ?? "semi",
          dash: o.dash ?? STYLE.dash,
          size: o.size ?? STYLE.size,
          font: STYLE.font,
          align: o.align ?? "middle",
          verticalAlign: o.verticalAlign ?? "middle",
          growY: 0,
          url: "",
          scale: 1,
          flipX: false,
          flipY: false,
        },
      };
      shapes.push(s);
      byKey.set(key, s);
      return api;
    },
    group(key, x, y, w, h, label) {
      return api.box(key, x, y, w, h, label, {
        fill: "none", dash: "dashed", color: "grey", labelColor: "grey",
        align: "start", verticalAlign: "start",
      });
    },
    text(key, x, y, w, label, o = {}) {
      const s = {
        key, x, y, w,
        type: "text",
        props: {
          color: o.color ?? STYLE.color,
          size: o.size ?? STYLE.size,
          font: STYLE.font,
          textAlign: o.align ?? "start",
          w,
          richText: toRichText(label),
          scale: 1,
          autoSize: false,
        },
      };
      shapes.push(s);
      byKey.set(key, s);
      return api;
    },
    sticky(key, x, y, label, o = {}) {
      const s = {
        key, x, y, w: 200, h: 200,
        type: "note",
        props: {
          color: o.color ?? "yellow",
          labelColor: "black",
          size: o.size ?? "s",
          font: STYLE.font,
          fontSizeAdjustment: null,
          align: "middle",
          verticalAlign: "middle",
          growY: 0,
          url: "",
          richText: toRichText(label),
          scale: 1,
          textLastEditedBy: null,
        },
      };
      shapes.push(s);
      byKey.set(key, s);
      return api;
    },
    arrow(from, to, label = "", o = {}) {
      arrows.push({ from, to, label, o });
      return api;
    },
  };
  build(api);

  const pageId = "page:page";
  const indices = tlutils.getIndices(shapes.length + arrows.length + 1).slice(1);
  const records = [
    DocumentRecordType.create({ id: TLDOCUMENT_ID }),
    PageRecordType.create({ id: pageId, name: "Page 1", index: "a1" }),
  ];
  const base = (id, type, x, y, index, props) => ({
    id, typeName: "shape", type, x, y, rotation: 0, index, parentId: pageId,
    isLocked: false, opacity: 1, meta: {}, props,
  });
  const center = (s) => ({ x: s.x + s.w / 2, y: s.y + (s.h ?? 40) / 2 });

  // Groups first so they sit behind their contents.
  const ordered = [...shapes].sort((a, b) => (b.props.dash === "dashed") - (a.props.dash === "dashed"));
  ordered.forEach((s, i) => records.push(base(createShapeId(s.key), s.type, s.x, s.y, indices[i], s.props)));

  arrows.forEach((a, i) => {
    const from = byKey.get(a.from);
    const to = byKey.get(a.to);
    if (!from || !to) throw new Error(`arrow ${a.from}→${a.to}: unknown shape`);
    const id = createShapeId(`arrow-${i}`);
    const c1 = center(from);
    const c2 = center(to);
    records.push(
      base(id, "arrow", c1.x, c1.y, indices[shapes.length + i], {
        kind: "arc",
        labelColor: "black",
        color: a.o.color ?? "black",
        fill: "none",
        dash: a.o.dash ?? "solid",
        size: "s",
        arrowheadStart: "none",
        arrowheadEnd: "arrow",
        font: STYLE.font,
        start: { x: 0, y: 0 },
        end: { x: c2.x - c1.x, y: c2.y - c1.y },
        bend: a.o.bend ?? 0,
        richText: toRichText(a.label),
        labelPosition: 0.5,
        scale: 1,
        elbowMidPoint: 0.5,
      }),
    );
    for (const [terminal, target] of [["start", from], ["end", to]]) {
      records.push({
        id: createBindingId(`arrow-${i}-${terminal}`),
        typeName: "binding",
        type: "arrow",
        fromId: id,
        toId: createShapeId(target.key),
        meta: {},
        props: { terminal, normalizedAnchor: { x: 0.5, y: 0.5 }, isExact: false, isPrecise: false, snap: "none" },
      });
    }
  });

  // Putting records into a real store runs tldraw's validators, so a bad prop fails here, not in the browser.
  const store = new tlstore.Store({
    schema: createTLSchema(),
    props: { defaultName: "", assets: {}, onMount: () => {} },
  });
  store.put(records);
  return store.getStoreSnapshot();
}
