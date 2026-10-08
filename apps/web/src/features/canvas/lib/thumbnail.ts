/**
 * Renders the current canvas page to a small PNG, uploads it to Supabase
 * Storage and records the URL on the canvas (shown by the notes
 * canvas-reference block).
 *
 * The object path carries a random segment so a thumbnail URL can't be
 * derived from a canvas id; the API only hands the URL to people who can
 * view the canvas. The previous thumbnail is removed best-effort.
 */
import type { Editor } from "tldraw";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { updateCanvasClientApi } from "../api/canvases-client-api";
import { THUMBNAIL_BUCKET } from "../constants";

const MAX_WIDTH_PX = 800;

export async function uploadCanvasThumbnail(
  editor: Editor,
  canvasId: string,
  previousUrl: string | null,
): Promise<string | null> {
  const shapeIds = [...editor.getCurrentPageShapeIds()];
  if (shapeIds.length === 0) return null;
  const bounds = editor.getCurrentPageBounds();
  const scale = bounds && bounds.w > MAX_WIDTH_PX ? MAX_WIDTH_PX / bounds.w : 1;

  const { blob } = await editor.toImage(shapeIds, {
    format: "png",
    background: true,
    padding: 32,
    scale,
    darkMode: false,
  });

  const supabase = createSupabaseBrowserClient();
  const path = `${canvasId}/${crypto.randomUUID()}.png`;
  const { error } = await supabase.storage
    .from(THUMBNAIL_BUCKET)
    .upload(path, blob, { contentType: "image/png", upsert: false });
  if (error) throw new Error(`Thumbnail upload failed: ${error.message}`);

  const url = supabase.storage.from(THUMBNAIL_BUCKET).getPublicUrl(path).data.publicUrl;
  await updateCanvasClientApi(canvasId, { thumbnailUrl: url });

  const previousPath = previousUrl?.split(`/${THUMBNAIL_BUCKET}/`)[1];
  if (previousPath) {
    void supabase.storage.from(THUMBNAIL_BUCKET).remove([previousPath]);
  }
  return url;
}
