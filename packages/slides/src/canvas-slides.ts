/**
 * A canvas's slides without the canvas library: its frames and figures in
 * reading order, then its own saved order, hidden slides left out. Mirrors
 * presentationSlides in @octonote/octodraw (canvas/present.ts) so a deck made
 * on the server (API, CLI, agents) matches one made in the app; the canvas
 * document is read loosely, as stored JSON.
 */
import type { CanvasSlideRef } from "./convert.js";

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

type Item = Box & { id: string; type: string; source?: string; title?: string; device?: string };

const DEVICE_LABEL: Record<string, string> = { phone: "Phone", tablet: "Tablet", browser: "Browser", desktop: "Desktop" };

const isItem = (v: unknown): v is Item => {
  if (!v || typeof v !== "object") return false;
  const i = v as Record<string, unknown>;
  return typeof i.id === "string" && typeof i.type === "string" && ["x", "y", "w", "h"].every((k) => typeof i[k] === "number");
};

const contains = (outer: Box, inner: Box) => inner.x >= outer.x && inner.y >= outer.y && inner.x + inner.w <= outer.x + outer.w && inner.y + inner.h <= outer.y + outer.h;

const figureTitle = (source: string | undefined) => (source ? /^\s*title\s+(.+?)\s*$/m.exec(source)?.[1] : undefined);

export function canvasSlideRefs(document: unknown): CanvasSlideRef[] {
  const doc = (document && typeof document === "object" ? document : {}) as { items?: unknown; presentation?: { order?: unknown; hidden?: unknown } };
  const items = (Array.isArray(doc.items) ? doc.items : []).filter(isItem);
  const frames = items.filter((i) => i.type === "frame");
  const candidates = items.filter((i) => i.type === "frame" || (i.type === "figure" && !frames.some((f) => contains(f, i))));
  // Reading order: rows top to bottom (items whose tops are close share a row), then left to right.
  const rows: Item[][] = [];
  for (const item of [...candidates].sort((a, b) => a.y - b.y)) {
    const row = rows.at(-1);
    if (row && item.y < row[0]!.y + Math.min(row[0]!.h, item.h) / 2) row.push(item);
    else rows.push([item]);
  }
  const natural = rows
    .flatMap((row) => row.sort((a, b) => a.x - b.x))
    .map((item, i) => ({
      itemId: item.id,
      title: item.type === "figure" ? (figureTitle(item.source) ?? `Diagram ${i + 1}`) : (item.title ?? DEVICE_LABEL[item.device ?? ""] ?? ""),
    }));
  if (!natural.length) return items.length ? [{ itemId: null, title: "" }] : [];
  const order = Array.isArray(doc.presentation?.order) ? (doc.presentation!.order as unknown[]).filter((x): x is string => typeof x === "string") : [];
  const hidden = new Set(Array.isArray(doc.presentation?.hidden) ? (doc.presentation!.hidden as unknown[]) : []);
  const byId = new Map(natural.map((s) => [s.itemId, s]));
  const ordered = [...order.flatMap((id) => (byId.has(id) ? [byId.get(id)!] : [])), ...natural.filter((s) => !order.includes(s.itemId))];
  return ordered.filter((s) => !hidden.has(s.itemId));
}
