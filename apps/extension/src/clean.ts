/** Checks on what the clipper sends before it reaches Octonote. */
import type { ClipApp, ClipSource } from "./messages";

export const MAX_CLIP_CHARS = 20_000;
const APPS: ClipApp[] = ["chatgpt", "claude", "gemini", "octonote", "web", "other"];

export function cleanSource(source: unknown): ClipSource {
  const s = (source ?? {}) as Record<string, unknown>;
  const app = APPS.includes(s.app as ClipApp) ? (s.app as ClipApp) : "other";
  const out: ClipSource = { app };
  if (typeof s.url === "string" && s.url.length <= 2000) {
    try {
      const url = new URL(s.url);
      if (url.protocol === "https:" || url.protocol === "http:") {
        url.hash = "";
        out.url = url.toString();
      }
    } catch {
      // Not a URL: leave it out.
    }
  }
  if (typeof s.title === "string" && s.title.trim())
    out.title = s.title.trim().slice(0, 200);
  return out;
}

/** The clip's text, or why it can't be clipped. */
export function cleanContent(content: unknown): { content: string } | { error: string } {
  if (typeof content !== "string" || !content.trim())
    return { error: "There's nothing to clip. Select some text first." };
  const text = content.trim();
  if (text.length > MAX_CLIP_CHARS)
    return {
      error: `That's ${text.length.toLocaleString()} characters; a clip can be up to ${MAX_CLIP_CHARS.toLocaleString()}. Select a smaller part.`,
    };
  return { content: text };
}

/** Which assistant a page belongs to. */
export function appFor(url: string | undefined): ClipApp {
  try {
    const host = new URL(url ?? "").hostname;
    if (host === "chatgpt.com" || host === "chat.openai.com") return "chatgpt";
    if (host === "claude.ai") return "claude";
    if (host === "gemini.google.com") return "gemini";
    return "web";
  } catch {
    return "other";
  }
}
