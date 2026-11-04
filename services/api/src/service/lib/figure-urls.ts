/**
 * Figures in a note: finding them, and moving old links to the figure's own.
 * Figure pictures used to be linked straight from Storage. Old links can still
 * come back in a saved tab or a pulled markdown file, so saves correct them.
 */
import { appUrl } from "./resource-url";

const OLD_STORAGE_URL = /https?:\/\/[^"'\s)]+\/storage\/v1\/object\/public\/canvas-figures\/(fig_[0-9a-f-]{36})\.png/g;
const FIGURE_ID_PROP = /"figureId":"(fig_[0-9a-f-]{36})"/g;

/** Rewrites old Storage links to /f/<id>.png; keeps any query or fragment after them. */
export function withFigureLinks(text: string): string {
  return text.replace(OLD_STORAGE_URL, (_, id: string) => `${appUrl()}/f/${id}.png`);
}

export function documentWithFigureLinks(document: unknown): unknown {
  const text = JSON.stringify(document);
  if (text === undefined) return document;
  const next = withFigureLinks(text);
  return next === text ? document : (JSON.parse(next) as unknown);
}

/** The figures a note document shows. */
export function figureIdsIn(document: unknown): string[] {
  const text = JSON.stringify(document ?? null);
  return [...new Set([...text.matchAll(FIGURE_ID_PROP)].map((m) => m[1]!))];
}
