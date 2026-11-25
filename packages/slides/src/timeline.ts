/**
 * A slide's animations as a timeline of clicks, PowerPoint-style. Step 0 is
 * arriving on the slide: animations before the first `click` play then by
 * themselves. Each `click` starts the next step; `with` starts with the
 * previous animation, `after` when it ends (plus its own delay). Presenting
 * is one position, `{ slide, step }`; the CSS below shows that position,
 * playing its step's animations when it was reached by going forward.
 */
import type { DeckSlide, SlideAnimation } from "./model.js";

export interface TimedAnimation {
  animation: SlideAnimation;
  /** Milliseconds from the start of its step. */
  start: number;
}

export type TimelineStep = TimedAnimation[];

export function slideTimeline(slide: DeckSlide): TimelineStep[] {
  const steps: TimelineStep[] = [[]];
  let prevStart = 0;
  let prevEnd = 0;
  for (const animation of slide.animations) {
    let start: number;
    if (animation.trigger === "click") {
      steps.push([]);
      start = animation.delay;
    } else if (animation.trigger === "with") start = prevStart + animation.delay;
    else start = prevEnd + animation.delay;
    steps.at(-1)!.push({ animation, start });
    prevStart = start;
    prevEnd = start + animation.duration;
  }
  return steps;
}

/** How many clicks a slide takes before Next moves on. */
export const slideSteps = (slide: DeckSlide) => slideTimeline(slide).length - 1;

/** How long a step takes to play out, in milliseconds. */
export const stepDuration = (step: TimelineStep) => step.reduce((end, t) => Math.max(end, t.start + t.animation.duration), 0);

const quote = (value: string) => `"${value.replace(/["\\]/g, "\\$&")}"`;

/** Emphasis effects whose end state stays after they've played (a highlighted point stays highlighted). */
const LASTING = new Set(["highlight"]);

export interface TimelineCssOptions {
  /** Scopes the rules to one drawing of the slide (the same slide can be on screen twice). */
  instance: string;
  /** How many clicks have played; omit to show the slide as built in the editor (every object visible). */
  step?: number;
  /** Play the current step's animations (moving forward); off when going back or jumping. */
  animate?: boolean;
  /** The selector for one paragraph inside a text box, given `[data-id="…"]`. */
  blockSelector?: (attributeMatch: string) => string;
  /** View-transition names for objects on both slides of a morph. */
  morphNames?: Map<string, string>;
}

/**
 * The CSS that shows a slide at a step: objects whose entrance is still to
 * come are hidden, objects that have left stay gone, and the current step's
 * effects play with their timing.
 */
export function timelineCss(slide: DeckSlide, { instance, step, animate = true, blockSelector = (m) => m, morphNames }: TimelineCssOptions): string {
  const scope = `[data-osl-instance=${quote(instance)}]`;
  const target = (a: SlideAnimation) =>
    `${scope} [data-osl-el=${quote(a.elementId)}]${a.blockId ? ` ${blockSelector(`[data-id=${quote(a.blockId)}]`)}` : ""}`;
  const rules: string[] = [];
  if (step !== undefined) {
    const steps = slideTimeline(slide);
    const at = Math.max(0, Math.min(step, steps.length - 1));
    // Per target: its state after everything up to `at`, and what plays at `at`.
    const state = new Map<string, { hidden: boolean; playing: string[]; lasting: string[] }>();
    const of = (a: SlideAnimation) => {
      const key = target(a);
      if (!state.has(key)) {
        // Anything with an entrance starts hidden until that entrance.
        const enters = slide.animations.some((x) => x.type === "in" && x.elementId === a.elementId && x.blockId === a.blockId);
        state.set(key, { hidden: enters, playing: [], lasting: [] });
      }
      return state.get(key)!;
    };
    for (const a of slide.animations) of(a);
    steps.slice(0, at + 1).forEach((timed, i) => {
      for (const { animation: a, start } of timed) {
        const s = of(a);
        const current = i === at;
        if (a.type === "in") s.hidden = false;
        if (a.type === "out") s.hidden = true;
        if (current && animate) {
          s.playing.push(`osl-fx-${a.effect} ${a.duration}ms var(--osl-ease) ${start}ms both`);
          // While an exit plays it must stay on screen; its keyframes end invisible.
          if (a.type === "out") s.hidden = false;
        } else if (a.type === "emphasis" && LASTING.has(a.effect)) s.lasting.push(`osl-fx-${a.effect} 1ms linear 0ms both`);
      }
    });
    for (const [selector, s] of state) {
      if (s.hidden) rules.push(`${selector}{visibility:hidden}`);
      const running = [...s.lasting, ...s.playing];
      if (running.length) rules.push(`${selector}{animation:${running.join(",")}}`);
    }
  }
  for (const [id, name] of morphNames ?? []) rules.push(`${scope} [data-osl-el=${quote(id)}]{view-transition-name:${name}}`);
  return rules.join("\n");
}
