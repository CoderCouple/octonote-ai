/**
 * Pure helpers that derive reader-side metadata (reading time, section
 * headings for the right-rail TOC, figure/source counts for the
 * metadata line) from a BlockNote document + markdown projection.
 * No React; no fetches. Consumers memoise.
 */

export interface SectionEntry {
  id: string;
  text: string;
  level: 1 | 2 | 3;
}

/** Words-per-minute target for reading-time estimation. */
const WPM = 220;

/** Return the estimated read time in minutes, rounded up, min 1. */
export function computeReadingMinutes(contentMd: string): number {
  if (!contentMd) return 1;
  const words = contentMd.trim().split(/\s+/).filter(Boolean).length;
  if (!words) return 1;
  return Math.max(1, Math.ceil(words / WPM));
}

/** Extract the plain-text projection from a BlockNote inline content array. */
function extractText(content: unknown): string {
  if (!Array.isArray(content)) return "";
  return content
    .map((c) => {
      if (c && typeof c === "object" && "type" in c && c.type === "text" && "text" in c) {
        return typeof (c as { text?: unknown }).text === "string"
          ? ((c as { text: string }).text)
          : "";
      }
      return "";
    })
    .join("");
}

/**
 * Extract the underlying block array from whatever shape the page's
 * `document` field is stored in. BlockNote round-trips as
 * `{ blocks: [...] }` for read-only wrappers, but older rows are the
 * bare array. Handle both.
 */
function toBlockArray(document: unknown): unknown[] {
  if (Array.isArray(document)) return document;
  if (
    document &&
    typeof document === "object" &&
    Array.isArray((document as { blocks?: unknown }).blocks)
  ) {
    return (document as { blocks: unknown[] }).blocks;
  }
  return [];
}

/**
 * Walk a BlockNote document (`document` field on a page) and return the
 * heading tree flattened. Only H1–H3 are surfaced.
 */
export function collectSections(document: unknown): SectionEntry[] {
  const out: SectionEntry[] = [];
  const walk = (blocks: unknown[]) => {
    for (const block of blocks) {
      if (!block || typeof block !== "object") continue;
      const b = block as {
        type?: string;
        id?: string;
        props?: { level?: number };
        content?: unknown;
        children?: unknown[];
      };
      if (b.type === "heading" && typeof b.id === "string") {
        const raw = b.props?.level ?? 1;
        const level = (raw >= 1 && raw <= 3 ? raw : 1) as 1 | 2 | 3;
        out.push({ id: b.id, text: extractText(b.content), level });
      }
      if (Array.isArray(b.children) && b.children.length > 0) walk(b.children);
    }
  };
  walk(toBlockArray(document));
  return out;
}

/** Count `figure` custom blocks in the document. */
export function countFigures(document: unknown): number {
  return countBlocksByType(document, "figure");
}

function countBlocksByType(document: unknown, type: string): number {
  let n = 0;
  const walk = (blocks: unknown[]) => {
    for (const block of blocks) {
      if (!block || typeof block !== "object") continue;
      const b = block as { type?: string; children?: unknown[] };
      if (b.type === type) n += 1;
      if (Array.isArray(b.children) && b.children.length > 0) walk(b.children);
    }
  };
  walk(toBlockArray(document));
  return n;
}

/**
 * Rough source count — matches the boxed footnote refs that appear in the
 * markdown (`[1]`, `[2]`, …). We de-duplicate so a source cited twice
 * still counts once.
 */
export function countSources(contentMd: string): number {
  if (!contentMd) return 0;
  const seen = new Set<string>();
  for (const m of contentMd.matchAll(/\[(\d+)\]/g)) seen.add(m[1]);
  return seen.size;
}

/**
 * Compose the compact metadata line rendered under the editor H1
 * ("Research · 2 figures · 5 sources · 3 backlinks"). Kind is optional
 * label; backlink count is passed in because it's only knowable via API.
 */
export function metadataLine(input: {
  kind?: string;
  figures: number;
  sources: number;
  backlinks?: number;
}): string {
  const parts: string[] = [];
  if (input.kind) parts.push(input.kind);
  if (input.figures > 0) {
    parts.push(`${input.figures} figure${input.figures === 1 ? "" : "s"}`);
  }
  if (input.sources > 0) {
    parts.push(`${input.sources} source${input.sources === 1 ? "" : "s"}`);
  }
  if (input.backlinks && input.backlinks > 0) {
    parts.push(`${input.backlinks} backlink${input.backlinks === 1 ? "" : "s"}`);
  }
  return parts.join(" · ");
}
