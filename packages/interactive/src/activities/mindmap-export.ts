import { edgeEnds, edgePath, styleAt, type PlacedNode } from "./mindmap-layout.js";

/**
 * Exports what's on screen as a standalone SVG (and from it a PNG), drawn
 * from the same layout the map uses, so it matches without screenshotting
 * the page. Colours are read from the map's CSS variables at export time,
 * so the file follows the theme it was exported in.
 */

export interface ExportColors {
  background: string;
  surface: string;
  text: string;
  strong: string;
  rootBg: string;
  rootFg: string;
  branches: string[];
}

export const BRANCH_COUNT = 8;

export function readColors(el: Element): ExportColors {
  const css = getComputedStyle(el);
  const v = (name: string, fallback: string) => css.getPropertyValue(name).trim() || fallback;
  return {
    background: v("--ix-surface-muted", "#f7f7f5"),
    surface: v("--ix-surface", "#ffffff"),
    text: v("--ix-fg", "#37352f"),
    strong: v("--ix-fg-strong", "#191919"),
    rootBg: v("--ix-mindmap-root-bg", "#191919"),
    rootFg: v("--ix-mindmap-root-fg", "#ffffff"),
    branches: Array.from({ length: BRANCH_COUNT }, (_, i) => v(`--ix-branch-${i}`, "#2f6fde")),
  };
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const FONT = "Inter, ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif";

export function mindmapSvg(nodes: readonly PlacedNode[], positions: ReadonlyMap<string, { x: number; y: number }>, colors: ExportColors, title?: string): { svg: string; width: number; height: number } {
  const pad = 32;
  const boxes = nodes.map((p) => ({ p, ...positions.get(p.node.id)! }));
  const minX = Math.min(...boxes.map((b) => b.x)) - pad;
  const minY = Math.min(...boxes.map((b) => b.y)) - pad;
  const width = Math.ceil(Math.max(...boxes.map((b) => b.x + b.p.w)) + pad - minX);
  const height = Math.ceil(Math.max(...boxes.map((b) => b.y + b.p.h)) + pad - minY);
  const byId = new Map(boxes.map((b) => [b.p.node.id, b]));
  const branch = (p: PlacedNode) => colors.branches[Math.max(0, p.branch) % BRANCH_COUNT]!;

  const edges = boxes
    .map(({ p, x, y }) => {
      const parent = p.node.parent ? byId.get(p.node.parent) : undefined;
      if (!parent) return "";
      const { start, end } = edgeEnds({ ...parent, w: parent.p.w, h: parent.p.h, depth: parent.p.depth }, { x, y, w: p.w, h: p.h, depth: p.depth, side: p.side });
      return `<path d="${edgePath(start, end)}" fill="none" stroke="${branch(p)}" stroke-width="${p.depth === 1 ? 3 : 2}" stroke-linecap="round"/>`;
    })
    .join("");

  const shapes = boxes
    .map(({ p, x, y }) => {
      const s = styleAt(p.depth);
      const color = branch(p);
      let box = "";
      let fill = colors.strong;
      if (p.depth === 0) {
        box = `<rect x="${x}" y="${y}" width="${p.w}" height="${p.h}" rx="14" fill="${colors.rootBg}"/>`;
        fill = colors.rootFg;
      } else if (p.depth === 1) {
        box = `<rect x="${x + 0.75}" y="${y + 0.75}" width="${p.w - 1.5}" height="${p.h - 1.5}" rx="10" fill="${colors.surface}" stroke="${color}" stroke-width="1.5"/>`;
      } else {
        box = `<line x1="${x}" y1="${y + p.h - 1}" x2="${x + p.w}" y2="${y + p.h - 1}" stroke="${color}" stroke-width="2" stroke-linecap="round"/>`;
        fill = colors.text;
      }
      // Main topics are centred; smaller ones line up with the branch they hang off.
      const anchor = p.depth < 2 ? "middle" : p.side === "left" ? "end" : "start";
      const tx = anchor === "middle" ? x + p.w / 2 : anchor === "end" ? x + p.w - s.padX : x + s.padX;
      const text = p.lines
        .map((line, i) => `<text x="${tx}" y="${y + s.padY + s.lineHeight * i + s.lineHeight * 0.72}" text-anchor="${anchor}">${esc(line)}</text>`)
        .join("");
      return `${box}<g font-size="${s.fontSize}" font-weight="${s.fontWeight}" fill="${fill}">${text}</g>`;
    })
    .join("");

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="${minX} ${minY} ${width} ${height}" font-family="${esc(FONT)}">${title ? `<title>${esc(title)}</title>` : ""}<rect x="${minX}" y="${minY}" width="${width}" height="${height}" fill="${colors.background}"/>${edges}${shapes}</svg>`;
  return { svg, width, height };
}

export function fileName(title: string | undefined, ext: string): string {
  const base = (title ?? "").trim().replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-+|-+$/g, "").toLowerCase() || "mind-map";
  return `${base}.${ext}`;
}

function save(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function downloadSvg(svg: string, title?: string) {
  save(new Blob([svg], { type: "image/svg+xml" }), fileName(title, "svg"));
}

/** Draws the SVG onto a canvas at twice the size (capped for huge maps) and saves it as a PNG. */
export async function downloadPng(svg: string, width: number, height: number, title?: string): Promise<void> {
  const scale = Math.min(2, Math.sqrt(32_000_000 / (width * height)), 16_000 / Math.max(width, height));
  const img = new Image();
  img.decoding = "async";
  img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  await img.decode();
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.floor(width * scale));
  canvas.height = Math.max(1, Math.floor(height * scale));
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Couldn't draw the image");
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
  if (!blob) throw new Error("Couldn't make the image");
  save(blob, fileName(title, "png"));
}
