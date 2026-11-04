export const canvasKeys = {
  all: ["canvases"] as const,
  list: (workspaceId: string) =>
    [...canvasKeys.all, "list", workspaceId] as const,
  pickable: (workspaceId: string) =>
    [...canvasKeys.all, "pickable", workspaceId] as const,
  summary: (canvasId: string) =>
    [...canvasKeys.all, "summary", canvasId] as const,
};

/** Supabase Storage bucket for canvas PNG thumbnails (see supabase/storage.sql). */
export const THUMBNAIL_BUCKET = "canvas-thumbnails";
/** Marks thumbnails drawn the current way; change it to redraw every older one. */
export const THUMBNAIL_FILE_PREFIX = "v2-";

/** Missing, or drawn the old way. Old ones keep showing until the new one is ready. */
export function thumbnailIsStale(url: string | null | undefined): boolean {
  return !url?.includes(`/${THUMBNAIL_FILE_PREFIX}`);
}

/**
 * Fired on a note (`data-figure-drop-zone`) when a figure is dragged there
 * from a canvas's title-bar handle. detail: { figureId, x, y }.
 */
export const FIGURE_DROP_EVENT = "octonote:figure-drop";
