/**
 * Uploads an image dropped, pasted or picked into a note to Supabase Storage
 * and returns its public URL (BlockNote's `uploadFile`). The path has a
 * random segment, so the URL can't be guessed from the note id.
 */
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

export const NOTE_IMAGES_BUCKET = "note-images";
const MAX_BYTES = 10 * 1024 * 1024;
const EXT: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/gif": "gif",
  "image/webp": "webp",
  "image/svg+xml": "svg",
};

export async function uploadNoteImage(
  file: File,
  pageId: string,
): Promise<string> {
  const ext = EXT[file.type];
  if (!ext)
    throw new Error(
      "Only PNG, JPEG, GIF, WebP and SVG images can be added to notes.",
    );
  if (file.size > MAX_BYTES) throw new Error("Images must be under 10 MB.");

  const supabase = createSupabaseBrowserClient();
  const path = `${pageId}/${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage
    .from(NOTE_IMAGES_BUCKET)
    .upload(path, file, {
      contentType: file.type,
      upsert: false,
      cacheControl: "31536000",
    });
  if (error) throw new Error(`Image upload failed: ${error.message}`);
  return supabase.storage.from(NOTE_IMAGES_BUCKET).getPublicUrl(path).data
    .publicUrl;
}
