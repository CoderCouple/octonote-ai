/** The deck model and converters, without React: for the API, the CLI and tests. */
// The deck model: slides, layouts, builds, transitions, validation and navigation.
export {
  allBlockIds,
  blockText,
  BUILD_EFFECTS,
  clampPosition,
  DECK_ASPECTS,
  DECK_LIMITS,
  DECK_THEMES,
  DECK_VERSION,
  deckProblems,
  emptyDeck,
  heading,
  newSlide,
  nextPosition,
  paragraph,
  previousPosition,
  SLIDE_LAYOUTS,
  SLIDE_TRANSITIONS,
  slideId,
  slideSteps,
  slideTitle,
  toDeckDocument,
  visibleDeckSlides,
} from "./model.js";
export type {
  BuildEffect,
  DeckAspect,
  DeckDocument,
  DeckPosition,
  DeckSlide,
  DeckSource,
  DeckTheme,
  NoteBlock,
  SlideBuild,
  SlideCanvas,
  SlideLayout,
  SlideTransition,
  SplitMode,
} from "./model.js";
// Notes, projects and notebooks → decks.
export { deckFromNote, deckFromNotebook, deckFromProject, DEFAULT_CONVERT, isMediaBlock } from "./convert.js";
export type { CanvasSlideRef, CanvasSource, ConvertOptions, NotebookEntry, NotebookSource, NoteSource, ProjectSource } from "./convert.js";
// Editing: pure deck operations.
export { addSlide, buildableBlocks, duplicateSlide, moveBuild, moveSlide, removeSlide, setBuild, updateSlide } from "./ops.js";
