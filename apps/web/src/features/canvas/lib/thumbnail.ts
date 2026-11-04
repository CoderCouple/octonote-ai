/**
 * Renders a canvas's picture to a PNG (always light), uploads it to Supabase
 * Storage and records the URL on the canvas. A canvas shows the whole canvas; a
 * project shows its first figure, which stays readable at card size, or the
 * whole canvas if it has none. (A project with an empty canvas shows its note's
 * first image; the API falls back to that.)
 *
 * The object path carries a random segment so a thumbnail URL can't be
 * derived from a canvas id; the API only hands the URL to people who can
 * view the canvas. The previous thumbnail is removed best-effort.
 */
import type { CanvasDocument, FigureItem } from "@octonote/octodraw";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { updateCanvasClientApi } from "../api/canvases-client-api";
import { THUMBNAIL_BUCKET, THUMBNAIL_FILE_PREFIX } from "../constants";
import { renderCanvasPng, renderFigurePng } from "./render";

// Sharp on a high-resolution screen at any size a card or note shows it. The
// smaller widths are for the rare picture over the bucket's 2 MB limit.
const WIDTHS_PX = [1600, 1200, 800];
const MAX_BYTES = 2 * 1024 * 1024;
/** Figures whose tops are this close count as one row. */
const ROW_PX = 80;

/** The first figure in reading order: top to bottom, then left to right. */
export function firstFigure(doc: CanvasDocument): FigureItem | null {
  const figures = doc.items.filter(
    (i): i is FigureItem => i.type === "figure" && i.source.trim() !== "",
  );
  const top = figures.length ? Math.min(...figures.map((f) => f.y)) : 0;
  const row = figures.filter((f) => f.y - top < ROW_PX);
  return row.sort((a, b) => a.x - b.x)[0] ?? null;
}

async function renderPicture(
  doc: CanvasDocument,
  width: number,
  inProject: boolean,
): Promise<Blob | null> {
  const figure = inProject ? firstFigure(doc) : null;
  if (figure) {
    try {
      return (await renderFigurePng(figure, width, { fill: true })).blob;
    } catch {
      // A figure that won't draw: the whole canvas instead.
    }
  }
  return renderCanvasPng(doc, { maxWidth: width, fill: true });
}

export async function uploadCanvasThumbnail(
  doc: CanvasDocument,
  canvasId: string,
  previousUrl: string | null,
  { inProject = false }: { inProject?: boolean } = {},
): Promise<string | null> {
  let blob: Blob | null = null;
  for (const width of WIDTHS_PX) {
    blob = await renderPicture(doc, width, inProject);
    if (!blob || blob.size <= MAX_BYTES) break;
  }
  if (!blob) return null;

  const supabase = createSupabaseBrowserClient();
  const path = `${canvasId}/${THUMBNAIL_FILE_PREFIX}${crypto.randomUUID()}.png`;
  const { error } = await supabase.storage
    .from(THUMBNAIL_BUCKET)
    .upload(path, blob, { contentType: "image/png", upsert: false });
  if (error) throw new Error(`Thumbnail upload failed: ${error.message}`);

  const url = supabase.storage.from(THUMBNAIL_BUCKET).getPublicUrl(path)
    .data.publicUrl;
  await updateCanvasClientApi(canvasId, { thumbnailUrl: url });

  const previousPath = previousUrl?.split(`/${THUMBNAIL_BUCKET}/`)[1];
  if (previousPath) {
    void supabase.storage.from(THUMBNAIL_BUCKET).remove([previousPath]);
  }
  return url;
}
