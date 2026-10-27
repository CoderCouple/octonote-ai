/**
 * Mermaid's link lines, for flowcharts and class diagrams alike:
 *   click A href "https://…" ["tooltip"] [_blank]
 *   click A "https://…" ["tooltip"]
 *   link A "https://…" ["tooltip"]          (class diagrams)
 * Callback forms (`click A call fn()`, `click A fn`) are ignored, and only
 * http(s) links are kept — the canvas, the note renderer and the CLI share
 * this, so a diagram can never smuggle in a javascript: URL.
 */

const CLICK_RE = /^(?:click|link)\s+([\w.:-]+)\s+(?:href\s+)?"([^"]*)"/;

export function parseLinkLine(line: string): { id: string; url: string } | null {
  const m = line.trim().match(CLICK_RE);
  if (!m) return null;
  const url = safeUrl(m[2]!);
  return url ? { id: m[1]!, url } : null;
}

/** The URL when it's an absolute http(s) link, else null. */
export function safeUrl(raw: string): string | null {
  try {
    const u = new URL(raw.trim());
    return u.protocol === "https:" || u.protocol === "http:" ? u.toString() : null;
  } catch {
    return null;
  }
}
