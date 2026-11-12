import { sceneTheme, type SceneMode } from "./engine/color.js";
import { computeLayout } from "./engine/layout.js";
import type { MathTypesetter } from "./engine/math.js";
import { renderFrame, UNIT } from "./engine/render.js";
import { compileScene } from "./engine/timeline.js";
import type { Scene } from "./schema.js";

export interface ExportOptions {
  /** Frames per second. Defaults to 30. */
  fps?: number;
  /** Height of a landscape video, or width of a portrait one, in pixels. Defaults to 1080. */
  resolution?: 720 | 1080 | 1440;
  math?: MathTypesetter;
  /** Light or dark, to match the app. Defaults to the scene's own background, else dark. */
  theme?: SceneMode;
  onProgress?: (fraction: number) => void;
  signal?: AbortSignal;
}

export interface ExportedVideo {
  blob: Blob;
  /** "mp4" when the browser can encode H.264, otherwise "webm". */
  extension: "mp4" | "webm";
}

/** Whether this browser can export: it needs WebCodecs. */
export const canExportVideo = () => typeof VideoEncoder !== "undefined" && typeof OffscreenCanvas !== "undefined";

/**
 * Renders a scene frame by frame (not in real time) and encodes it in the
 * browser with WebCodecs. Frames are drawn off-screen from the same pure
 * renderer the player uses, so the video matches what was on screen.
 */
export async function exportVideo(scene: Scene, { fps = 30, resolution = 1080, math, theme: mode, onProgress, signal }: ExportOptions = {}): Promise<ExportedVideo> {
  if (!canExportVideo()) throw new Error("This browser can't export video (it needs WebCodecs)");
  const [{ renderToStaticMarkup }, mb] = await Promise.all([import("react-dom/server"), import("mediabunny")]);

  const layout = computeLayout(scene, { math });
  const compiled = compileScene(scene, layout);
  const theme = sceneTheme(mode ?? (scene.background === "light" ? "light" : "dark"));
  const W = layout.canvas.w * UNIT;
  const H = layout.canvas.h * UNIT;
  // Even pixel sizes: H.264 needs them.
  const even = (n: number) => Math.round(n / 2) * 2;
  const width = even(W >= H ? (resolution * W) / H : resolution);
  const height = even(W >= H ? resolution : (resolution * H) / W);

  const codec = await mb.getFirstEncodableVideoCodec(["avc", "vp9", "vp8"], { width, height, bitrate: mb.QUALITY_HIGH });
  if (!codec) throw new Error("This browser can't encode video at this size");
  const mp4 = codec === "avc";
  const output = new mb.Output({ format: mp4 ? new mb.Mp4OutputFormat({ fastStart: "in-memory" }) : new mb.WebMOutputFormat(), target: new mb.BufferTarget() });
  const canvas = new OffscreenCanvas(width, height);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("No 2D canvas");
  const source = new mb.CanvasSource(canvas, { codec, bitrate: mb.QUALITY_HIGH, keyFrameInterval: 2 });
  output.addVideoTrack(source, { frameRate: fps });
  await output.start();

  const frames = Math.ceil(compiled.duration * fps) + 1;
  try {
    for (let i = 0; i < frames; i++) {
      if (signal?.aborted) throw new DOMException("Export cancelled", "AbortError");
      const t = Math.min(compiled.duration, i / fps);
      const markup = renderToStaticMarkup(
        <svg xmlns="http://www.w3.org/2000/svg" viewBox={`0 0 ${W} ${H}`} width={width} height={height}>
          <rect width={W} height={H} fill={theme.background} />
          {renderFrame({ scene, layout, compiled, t, theme, math, idPrefix: "x" })}
        </svg>,
      );
      const bitmap = await svgToBitmap(markup);
      ctx.drawImage(bitmap, 0, 0, width, height);
      bitmap.close();
      await source.add(i / fps, 1 / fps);
      onProgress?.((i + 1) / frames);
    }
    await output.finalize();
  } catch (error) {
    await output.cancel().catch(() => {});
    throw error;
  }
  const buffer = output.target.buffer;
  if (!buffer) throw new Error("The encoder produced no video");
  return { blob: new Blob([buffer], { type: mp4 ? "video/mp4" : "video/webm" }), extension: mp4 ? "mp4" : "webm" };
}

async function svgToBitmap(markup: string): Promise<ImageBitmap> {
  const url = URL.createObjectURL(new Blob([markup], { type: "image/svg+xml" }));
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    return await createImageBitmap(img);
  } finally {
    URL.revokeObjectURL(url);
  }
}
