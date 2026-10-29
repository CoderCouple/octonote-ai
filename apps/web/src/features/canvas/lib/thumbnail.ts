/**
 * Renders the canvas document to a small PNG (always light), uploads it to Supabase
 * Storage and records the URL on the canvas (shown by the notes
 * canvas-reference block).
 *
 * The object path carries a random segment so a thumbnail URL can't be
 * derived from a canvas id; the API only hands the URL to people who can
 * view the canvas. The previous thumbnail is removed best-effort.
 */
import type { CanvasDocument } from "@octonote/octodraw";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { updateCanvasClientApi } from "../api/canvases-client-api";
import { THUMBNAIL_BUCKET } from "../constants";
import { renderCanvasPng } from "./render";

const MAX_WIDTH_PX = 800;

export async function uploadCanvasThumbnail(
  doc: CanvasDocument,
  canvasId: string,
  previousUrl: string | null,
): Promise<string | null> {
  const blob = await renderCanvasPng(doc, { maxWidth: MAX_WIDTH_PX });
  if (!blob) return null;

  const supabase = createSupabaseBrowserClient();
  const path = `${canvasId}/${crypto.randomUUID()}.png`;
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
