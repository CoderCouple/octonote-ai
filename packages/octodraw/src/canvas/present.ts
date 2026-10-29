import { boxContains, boundsOf, type Box, type CanvasDocument, type PresentationSettings } from './model';
import { figureTitle } from './templates';

// Presentation mode: the canvas shown one slide at a time. Slides are the
// figures and device frames on the canvas in reading order (a figure inside a
// frame belongs to the frame's slide); a canvas with neither is one slide.

export interface Slide {
  /** The item the slide shows, or null for the whole canvas. */
  id: string | null;
  title: string;
  box: Box;
  /** A figure slide replays its diagram's draw-in on arrival. */
  figure: boolean;
  /** Left out when presenting (still listed in the slides panel). */
  hidden?: boolean;
  /** Speaker notes. */
  notes?: string;
}

const DEVICE_LABEL = { phone: 'Phone', tablet: 'Tablet', browser: 'Browser', desktop: 'Desktop' } as const;

/**
 * Every slide in presentation order: the saved order first (ids that still
 * exist), then new slides in reading order. Hidden slides are included and
 * flagged; `visibleSlides` leaves them out.
 */
export function presentationSlides(doc: CanvasDocument): Slide[] {
  const natural = naturalSlides(doc);
  const p = doc.presentation;
  if (!p) return natural;
  const byId = new Map(natural.map((s) => [s.id, s]));
  const ordered = [...(p.order ?? []).flatMap((id) => (byId.has(id) ? [byId.get(id)!] : [])), ...natural.filter((s) => !s.id || !(p.order ?? []).includes(s.id))];
  return ordered.map((s) => {
    const extra: Partial<Slide> = {};
    if (s.id && p.hidden?.includes(s.id)) extra.hidden = true;
    const notes = s.id ? p.notes?.[s.id] : p.notes?.[''];
    if (notes) extra.notes = notes;
    return Object.keys(extra).length ? { ...s, ...extra } : s;
  });
}

/** The slides that are presented (hidden ones left out). */
export const visibleSlides = (doc: CanvasDocument) => presentationSlides(doc).filter((s) => !s.hidden);

const withPresentation = (doc: CanvasDocument, change: (p: PresentationSettings) => PresentationSettings): CanvasDocument => ({ ...doc, presentation: change(doc.presentation ?? {}) });

/** Moves a slide to a new position in the presentation order. */
export function moveSlide(doc: CanvasDocument, id: string, toIndex: number): CanvasDocument {
  const ids = presentationSlides(doc).flatMap((s) => (s.id ? [s.id] : []));
  const from = ids.indexOf(id);
  if (from < 0) return doc;
  ids.splice(from, 1);
  ids.splice(Math.max(0, Math.min(ids.length, toIndex)), 0, id);
  return withPresentation(doc, (p) => ({ ...p, order: ids }));
}

export function setSlideHidden(doc: CanvasDocument, id: string, hidden: boolean): CanvasDocument {
  return withPresentation(doc, (p) => {
    const rest = (p.hidden ?? []).filter((h) => h !== id);
    return { ...p, hidden: hidden ? [...rest, id] : rest };
  });
}

/** Speaker notes for a slide ('' for the whole-canvas slide). */
export function setSlideNotes(doc: CanvasDocument, id: string, notes: string): CanvasDocument {
  return withPresentation(doc, (p) => {
    const next = { ...(p.notes ?? {}) };
    if (notes.trim()) next[id] = notes;
    else delete next[id];
    return { ...p, notes: next };
  });
}

function naturalSlides(doc: CanvasDocument): Slide[] {
  const frames = doc.items.filter((i) => i.type === 'frame');
  const candidates = doc.items.filter((i) => i.type === 'frame' || (i.type === 'figure' && !frames.some((f) => boxContains(f, i))));
  // Reading order: rows top to bottom (items whose tops are close share a row), then left to right.
  const sorted = [...candidates].sort((a, b) => a.y - b.y);
  const rows: (typeof sorted)[] = [];
  for (const item of sorted) {
    const row = rows.at(-1);
    if (row && item.y < row[0]!.y + Math.min(row[0]!.h, item.h) / 2) row.push(item);
    else rows.push([item]);
  }
  const ordered = rows.flatMap((row) => row.sort((a, b) => a.x - b.x));
  if (ordered.length) {
    return ordered.map((item, i) => ({
      id: item.id,
      title: item.type === 'figure' ? (figureTitle(item.source) ?? `Diagram ${i + 1}`) : item.type === 'frame' ? (item.title ?? DEVICE_LABEL[item.device]) : '',
      box: { x: item.x, y: item.y, w: item.w, h: item.h },
      figure: item.type === 'figure',
    }));
  }
  const all = boundsOf(doc.items);
  return all ? [{ id: null, title: 'Canvas', box: all, figure: false }] : [];
}
