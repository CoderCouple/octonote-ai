/** Moving through a presentation, one click at a time. */
import type { DeckSlide } from "./model.js";
import { slideSteps } from "./timeline.js";

/** A place in a presentation: slide index (among shown slides) and how many clicks have played. */
export interface DeckPosition {
  slide: number;
  step: number;
}

/** The position after one "Next": the next click, else the next slide's start. Stays put at the very end. */
export function nextPosition(slides: DeckSlide[], at: DeckPosition): DeckPosition {
  const slide = slides[at.slide];
  if (!slide) return clampPosition(slides, at);
  if (at.step < slideSteps(slide)) return { slide: at.slide, step: at.step + 1 };
  return at.slide + 1 < slides.length ? { slide: at.slide + 1, step: 0 } : at;
}

/** The position after one "Back": the previous click, else the previous slide fully played. */
export function previousPosition(slides: DeckSlide[], at: DeckPosition): DeckPosition {
  if (at.step > 0) return { slide: at.slide, step: at.step - 1 };
  if (at.slide === 0) return at;
  const prev = slides[at.slide - 1]!;
  return { slide: at.slide - 1, step: slideSteps(prev) };
}

export function clampPosition(slides: DeckSlide[], at: DeckPosition): DeckPosition {
  if (!slides.length) return { slide: 0, step: 0 };
  const slide = Math.max(0, Math.min(slides.length - 1, Math.floor(at.slide) || 0));
  const step = Math.max(0, Math.min(slideSteps(slides[slide]!), Math.floor(at.step) || 0));
  return { slide, step };
}
