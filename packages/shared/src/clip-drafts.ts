/**
 * Drafts written from research clips (see the API's CollectionsService): the
 * checkable units of a draft carry character ranges, so the app can drop the
 * flagged ones exactly. Shared by the API and the web app.
 */
export interface DraftUnitRange {
  start: number;
  end: number;
}

/** Removes units from a draft by their ranges, then tidies blank lines. */
export function removeUnits(
  markdown: string,
  units: readonly DraftUnitRange[],
): string {
  let out = markdown;
  for (const u of [...units].sort((a, b) => b.start - a.start)) {
    // A whole line (list item or table row) goes with its line break.
    const lineStart = out.lastIndexOf("\n", u.start - 1) + 1;
    const lineEnd = out.indexOf("\n", u.end);
    const whole = out.slice(lineStart, lineEnd === -1 ? out.length : lineEnd);
    const piece = out.slice(u.start, u.end);
    if (
      whole.trim() === piece.trim() ||
      /^\s*([-*+]|\d+[.)])\s+/.test(whole) ||
      whole.trim().startsWith("|")
    ) {
      out =
        out.slice(0, lineStart) +
        out.slice(lineEnd === -1 ? out.length : lineEnd + 1);
    } else out = out.slice(0, u.start) + out.slice(u.end);
  }
  return out
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
