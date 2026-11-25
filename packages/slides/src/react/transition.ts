import type { DeckSlide, SlideElement } from "../model.js";
import type { SlideTransition } from "../model.js";

type ViewTransitionDocument = Document & {
  startViewTransition?: (update: () => void) => { finished: Promise<void> };
};

export const prefersReducedMotion = () =>
  typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

/** What makes two objects "the same" across slides: their id (a duplicated slide keeps it), else a text box's first block. */
const firstBlock = (e: SlideElement) => ("blocks" in e && typeof e.blocks[0]?.id === "string" ? e.blocks[0].id : null);

/**
 * Objects on both slides of a `morph`, each with a view-transition name, so
 * the browser moves them from their old place and size to the new one
 * (Keynote's Magic Move, reveal.js's auto-animate). Keyed by the new slide's
 * object id.
 */
export function morphPairs(from: DeckSlide, to: DeckSlide): { names: Map<string, string>; previous: Map<string, string> } {
  const names = new Map<string, string>();
  const previous = new Map<string, string>();
  const byId = new Map(from.elements.map((e) => [e.id, e]));
  const byBlock = new Map(from.elements.flatMap((e) => (firstBlock(e) ? [[firstBlock(e)!, e] as const] : [])));
  for (const e of to.elements) {
    const match = byId.get(e.id) ?? (firstBlock(e) ? byBlock.get(firstBlock(e)!) : undefined);
    if (!match) continue;
    const name = `osl-m-${names.size}`;
    names.set(e.id, name);
    previous.set(match.id, name);
  }
  return { names, previous };
}

/**
 * Runs `update` (the change of slide) inside a view transition of the given
 * kind. Browsers without view transitions, and people who asked for reduced
 * motion, get the change at once.
 */
export function runSlideTransition(kind: SlideTransition, update: () => void, root: HTMLElement | null, direction: 1 | -1 = 1): Promise<void> {
  const doc = (typeof document === "undefined" ? null : document) as ViewTransitionDocument | null;
  if (kind === "none" || !doc?.startViewTransition || prefersReducedMotion()) {
    update();
    return Promise.resolve();
  }
  const html = doc.documentElement;
  html.dataset.oslTransition = kind;
  // `push` slides the other way going back.
  html.dataset.oslDirection = direction === 1 ? "forward" : "back";
  root?.setAttribute("data-osl-transitioning", "");
  const done = () => {
    delete html.dataset.oslTransition;
    delete html.dataset.oslDirection;
    root?.removeAttribute("data-osl-transitioning");
  };
  try {
    return doc
      .startViewTransition(update)
      .finished.catch(() => {})
      .finally(done);
  } catch {
    done();
    update();
    return Promise.resolve();
  }
}
