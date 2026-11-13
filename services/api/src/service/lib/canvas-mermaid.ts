/**
 * A canvas (octodraw `CanvasDocument`) as a Mermaid flowchart, so its diagram
 * can travel as text (e.g. inserted into a chat by the browser extension).
 *
 * - Boxes, sticky notes, text, code, icons and figures become nodes (in
 *   reading order: top to bottom, then left to right). Empty boxes are kept
 *   only when a line connects them.
 * - Lines attached at both ends to nodes become edges, with their label,
 *   arrowheads (none / one / both ends) and dashed or dotted style.
 * - A titled frame becomes a subgraph holding the nodes whose centres lie
 *   inside it (the smallest frame wins; frames aren't nested).
 * - Labels are always quoted, with Mermaid's entity codes for the characters
 *   that would end or bend a label, so any text is safe.
 *
 * Positions, colours, pen strokes and images are left out.
 */

interface Endpoint {
  item?: unknown;
}

interface Item {
  id?: unknown;
  type?: unknown;
  x?: unknown;
  y?: unknown;
  w?: unknown;
  h?: unknown;
  shape?: unknown;
  text?: unknown;
  title?: unknown;
  name?: unknown;
  source?: unknown;
  start?: Endpoint;
  end?: Endpoint;
  startArrow?: unknown;
  endArrow?: unknown;
  startHead?: unknown;
  endHead?: unknown;
  dashed?: unknown;
  strokeStyle?: unknown;
}

const MAX_NODES = 1000;
const MAX_LABEL = 300;

const num = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0);

/** A label safe inside Mermaid's `"…"` (node and edge text): entity codes for the risky characters. */
export function mermaidLabel(text: string): string {
  const flat = text.replace(/\r\n?/g, "\n").trim();
  const cut = flat.length > MAX_LABEL ? `${flat.slice(0, MAX_LABEL - 1)}…` : flat;
  return cut
    .replace(/#/g, "#35;")
    .replace(/"/g, "#quot;")
    .replace(/</g, "#lt;")
    .replace(/>/g, "#gt;")
    .replace(/\|/g, "#124;")
    .replace(/`/g, "#96;")
    .replace(/[\t ]*\n[\t ]*/g, "<br/>");
}

function labelOf(it: Item): string | null {
  switch (it.type) {
    case "shape":
    case "sticky":
    case "text":
      return String(it.text ?? "");
    case "code":
      return String(it.text ?? "").split("\n").slice(0, 6).join("\n");
    case "icon":
      return String(it.name ?? "");
    case "figure":
      return /^\s*title\s+(.+)$/m.exec(String(it.source ?? ""))?.[1]?.trim() ?? "Figure";
    default:
      return null;
  }
}

function nodeText(it: Item, id: string, label: string): string {
  const q = `"${mermaidLabel(label)}"`;
  if (it.type === "shape" && it.shape === "ellipse") return `${id}((${q}))`;
  if (it.type === "shape" && it.shape === "diamond") return `${id}{${q}}`;
  if (it.type === "sticky" || it.type === "text") return `${id}[${q}]`;
  if (it.type === "code") return `${id}[/${q}/]`;
  return `${id}[${q}]`;
}

/** Arrowhead at an end: the new `startHead`/`endHead`, else the legacy boolean. */
const hasHead = (head: unknown, legacy: unknown) => (typeof head === "string" ? head !== "none" : legacy === true);

function edgeText(from: string, to: string, line: Item): string {
  const start = hasHead(line.startHead, line.startArrow);
  const end = hasHead(line.endHead, line.endArrow);
  const dashed = line.strokeStyle === "dashed" || line.strokeStyle === "dotted" || (line.strokeStyle === undefined && line.dashed === true);
  // Only an arrow at the start: draw it the other way round.
  const [a, b] = start && !end ? [to, from] : [from, to];
  const label = String(line.text ?? "").trim();
  let arrow: string;
  if (dashed) arrow = start && end ? "<-.->" : start || end ? "-.->" : "-.-";
  else arrow = start && end ? "<-->" : start || end ? "-->" : "---";
  return label ? `${a} ${arrow}|"${mermaidLabel(label)}"| ${b}` : `${a} ${arrow} ${b}`;
}

/** The canvas as a `flowchart TD` (no fence), or null when it has nothing to show as text. */
export function canvasToMermaid(document: unknown): string | null {
  const raw = (document as { items?: unknown } | null)?.items;
  if (!Array.isArray(raw)) return null;
  const items = (raw as unknown[]).filter((i): i is Item => !!i && typeof i === "object" && typeof (i as Item).id === "string");

  const lines = items.filter((i) => i.type === "line");
  const connected = new Set<string>();
  for (const l of lines) {
    if (typeof l.start?.item === "string") connected.add(l.start.item);
    if (typeof l.end?.item === "string") connected.add(l.end.item);
  }

  const candidates = items
    .map((it) => ({ it, label: labelOf(it) }))
    .filter((c): c is { it: Item; label: string } => c.label !== null)
    .filter((c) => c.label.trim() !== "" || connected.has(c.it.id as string))
    .sort((a, b) => num(a.it.y) - num(b.it.y) || num(a.it.x) - num(b.it.x))
    .slice(0, MAX_NODES);
  if (!candidates.length) return null;

  const idOf = new Map<string, string>();
  candidates.forEach((c, n) => idOf.set(c.it.id as string, `n${n + 1}`));

  // Frames with a title group the nodes whose centres they hold (the smallest one wins).
  const frames = items
    .filter((i) => i.type === "frame" && String(i.title ?? "").trim())
    .map((f) => ({ f, area: Math.max(num(f.w), 0) * Math.max(num(f.h), 0) }))
    .sort((a, b) => a.area - b.area);
  const groups = new Map<Item, string[]>();
  const grouped = new Set<string>();
  for (const c of candidates) {
    const cx = num(c.it.x) + num(c.it.w) / 2;
    const cy = num(c.it.y) + num(c.it.h) / 2;
    const frame = frames.find(
      ({ f }) => cx >= num(f.x) && cx <= num(f.x) + num(f.w) && cy >= num(f.y) && cy <= num(f.y) + num(f.h),
    )?.f;
    if (!frame) continue;
    const id = c.it.id as string;
    groups.set(frame, [...(groups.get(frame) ?? []), id]);
    grouped.add(id);
  }

  const out = ["flowchart TD"];
  for (const c of candidates) {
    const id = c.it.id as string;
    if (!grouped.has(id)) out.push(`  ${nodeText(c.it, idOf.get(id)!, c.label)}`);
  }
  let g = 0;
  for (const [frame, ids] of groups) {
    g += 1;
    out.push(`  subgraph g${g}["${mermaidLabel(String(frame.title))}"]`);
    for (const id of ids) {
      const c = candidates.find((x) => x.it.id === id)!;
      out.push(`    ${nodeText(c.it, idOf.get(id)!, c.label)}`);
    }
    out.push("  end");
  }
  for (const l of lines) {
    const from = typeof l.start?.item === "string" ? idOf.get(l.start.item) : undefined;
    const to = typeof l.end?.item === "string" ? idOf.get(l.end.item) : undefined;
    if (from && to) out.push(`  ${edgeText(from, to, l)}`);
  }
  return out.join("\n");
}
