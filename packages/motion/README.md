# @octonote/motion

Motion graphics for explaining ideas, in two layers.

**Building blocks:** `FadeIn`, `SlideIn`, `ScaleIn`, `Stagger`, `CountUp` (+ `useCountUp`), `DrawPath`, `Typewriter`, `Highlight`, plus `useInView` and `useReducedMotion`. They play when scrolled into view and respect reduced motion.

**Explainer scenes from JSON:** boxes, circles, text, arrows and counters on an SVG canvas, with a timeline of steps (show, hide, move, highlight, color, count, text) and a caption per step.

```tsx
import { ScenePlayer } from "@octonote/motion";
import "@octonote/motion/styles.css";

<ScenePlayer spec={sceneFromAnyModel} autoPlay />;
```

- The player has play/pause, step back/forward, a scrubber, speed, live captions and a transcript; keys: Space, ←/→, Home/End.
- `sceneStateAt(scene, step)` is pure, so any step can be shown directly and the renderer animates the difference.
- Two-pass generation: `outlineToolDefinition()` plans the scenes, then `sceneToolDefinition()` with `sceneRequest(outline, i)` writes each one.
- `validateScene` checks ids, targets, arrow ends and sizes, and never throws.
- Theme with `--mo-*` variables. No animation library dependency.

Example: `examples/food-journey.json`.
