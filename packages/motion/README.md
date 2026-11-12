# @octonote/motion

Motion graphics for explaining ideas, in two layers.

**Building blocks:** `FadeIn`, `SlideIn`, `ScaleIn`, `Stagger`, `CountUp` (+ `useCountUp`), `DrawPath`, `Typewriter`, `Highlight`, plus `useInView` and `useReducedMotion`. They play when scrolled into view and respect reduced motion.

**Explainer scenes from JSON (schema 2.0):** animated explanations in the style of 3Blue1Brown, played in the browser.

```tsx
import { ScenePlayer } from "@octonote/motion";
import "@octonote/motion/styles.css";

<ScenePlayer spec={sceneFromAnyModel} renderMath={(tex) => katexToSvg(tex)} />;
```

- **Canvas:** 16 × 9 units (or 9 × 16 portrait), origin at the centre, y up.
- **Elements:** rect, circle, ellipse, dot, polygon, line, arrow, curve, arc, brace, text, math (TeX), number, axes, plot (a formula in x), numberline, bars, table, grid and group.
- **Placement by relationship:** `[x, y]`, `{ of, side, gap }`, groups laid out as a row, column or grid, or `{ axes, x, y }` and `{ axes, x, plot }`. Models rarely need to compute coordinates.
- **Actions:** draw, write, fadeIn/fadeOut, grow, show/hide, move, scale, rotate, color, morph (one outline into another), trace (along a path or plot), indicate, circumscribe, flash, count, camera (focus and zoom) and wait, with stagger, easing and sequential steps.
- **Engine:** layout → timeline compiled to tweens → `renderFrame(t)`. A frame is a pure function of time, so playing, scrubbing, stepping and exporting always agree.
- **Player:** scrubber with step markers, step back and forward, speed, fullscreen, captions burned into the frame, a transcript, reduced-motion holds, and "Download video" (WebM, recorded in the browser).
  - Keys: Space, ←/→, Home/End and F.
- **Validation:** `validateScene` checks references, placement loops, formulas, and whether a shape can be morphed or traced. Errors read like instructions ("Only outline shapes can morph; "t" is a text"), so a model can fix them. It never throws.
- **Generation:** two passes. `outlineToolDefinition()` plans the scenes; then `sceneToolDefinition()` with `sceneRequest(outline, i)` writes each one, guided by `SCENE_GUIDE`.
- **No dependencies** beyond React and zod. Formulas go through a small parser and are never evaluated as JavaScript.

Examples in `examples/`: Pythagoras, sine wave, circle area (morph), bubble sort, binary search, TCP handshake, compound growth.
