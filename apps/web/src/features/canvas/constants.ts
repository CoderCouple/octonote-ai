export const canvasKeys = {
  all: ["canvases"] as const,
  list: (workspaceId: string) => [...canvasKeys.all, "list", workspaceId] as const,
  pickable: (workspaceId: string) => [...canvasKeys.all, "pickable", workspaceId] as const,
  summary: (canvasId: string) => [...canvasKeys.all, "summary", canvasId] as const,
};

/** Supabase Storage bucket for canvas PNG thumbnails (see supabase/storage.sql). */
export const THUMBNAIL_BUCKET = "canvas-thumbnails";
