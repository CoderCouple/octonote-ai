# @octonote/slides

Presentations for React. A deck is a list of slides; each slide has a layout and holds ordinary note blocks, so a slide can carry anything a note can: a quiz, a custom app, a Manim video, a mermaid diagram, a live canvas.

```tsx
import { Presenter, SlideStage, SlideView, deckFromNote } from "@octonote/slides";
import "@octonote/slides/styles.css";

const deck = deckFromNote({ title: note.title, blocks: note.document.blocks });

<Presenter deck={deck} renderBlocks={(blocks) => <MyBlocks blocks={blocks} />} onExit={stop} />;
```

- **Model** (`@octonote/slides/core`, no React): `DeckDocument` → `DeckSlide { layout, main, side, notes, builds, transition, hidden, canvas }`.
  - `toDeckDocument` repairs anything stored into a deck that loads. It never throws.
  - `deckProblems` explains what's wrong, for the API to refuse bad saves.
  - `DECK_LIMITS` caps a deck's size.
- **Layouts:** title, section, content, split (text left, block right), media (one block fills the slide), canvas (a live canvas zoomed to a frame or figure) and blank.
- **Builds:** each click reveals the next block with appear, fade, rise or wipe, or lights one up with highlight.
  - Presenting is one position, `{ slide, step }`; `nextPosition` and `previousPosition` walk it.
  - Back lands on the previous slide fully built, as in Keynote.
  - A live audience can follow the same position.
- **Transitions:** none, fade, push, zoom and morph, using the browser's View Transitions.
  - Morph moves blocks that appear on both slides to their new place and size, like Keynote's Magic Move or reveal.js's auto-animate.
  - Without view transitions, or with reduced motion, slides change at once.
- **Converters:** `deckFromNote`, `deckFromProject` and `deckFromNotebook`.
  - A note splits at its headings (H1/H2) or its dividers.
  - Text goes left and the section's block right, or the block fills the slide.
  - Optionally, paragraphs move to the presenter notes and the slide keeps the points.
  - A project's canvas becomes one slide per frame or figure.
  - A notebook becomes a section per item.
  - Pure and deterministic apart from new ids, so the app can preview before it creates.
- **React:**
  - `SlideStage` lays a slide out at 960 × 540 (or 720 × 540), close to a note's column so blocks keep their proportions, and scales it to fit.
  - `SlideView` draws one slide with your `renderBlocks` and `renderCanvas`.
  - `Presenter` is full screen, with keys and clickers (→ ← Space PageDown PageUp Home End, a number then Enter), swipe, B for a black screen, Esc, and auto-hiding controls.
  - `PresenterView` (its own window) shows the current and next slide, notes with adjustable size, a timer, and a slide list.
  - `SlideOutline` is a light thumbnail.
- **The host owns blocks.** Slides never import an editor. `renderBlocks` must put each block's id in `data-id` (BlockNote does), or in the attribute named by `blockIdAttribute`, for builds and morphs to find it.
