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

/**
 * Fired on a note (`data-figure-drop-zone`) when a figure is dragged there
 * from a canvas's title-bar handle. detail: { figureId, x, y }.
 */
export const FIGURE_DROP_EVENT = "octonote:figure-drop";
