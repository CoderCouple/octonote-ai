import { allBlockIds, type DeckSlide, type SlideTransition } from "../model.js";

type ViewTransitionDocument = Document & {
  startViewTransition?: (update: () => void) => { finished: Promise<void> };
};

export const prefersReducedMotion = () =>
  typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

/**
 * Blocks on both slides of a `morph`, each with a view-transition name, so
 * the browser moves them from their old place and size to the new one
 * (Keynote's Magic Move, reveal.js's auto-animate).
 */
export function morphPairs(from: DeckSlide, to: DeckSlide): Map<string, string> {
  const before = new Set(allBlockIds([...from.main, ...from.side]));
  const names = new Map<string, string>();
  for (const id of allBlockIds([...to.main, ...to.side])) if (before.has(id)) names.set(id, `osl-m-${names.size}`);
  return names;
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
