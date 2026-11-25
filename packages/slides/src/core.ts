/** The deck model and its tools, without React: for the API, the CLI and tests. */

// Note blocks as slides read them.
export { allBlockIds, blockText, bullet, heading, isMediaBlock, paragraph } from "./blocks.js";
export type { NoteBlock } from "./blocks.js";

// The model: free-form slides of objects, with an animation timeline.
export {
  ANIMATION_EFFECTS,
  ANIMATION_TRIGGERS,
  ANIMATION_TYPES,
  animationId,
  blockElement,
  DECK_ASPECTS,
  DECK_LIMITS,
  DECK_THEMES,
  DECK_VERSION,
  ELEMENT_KINDS,
  elementId,
  emptyDeck,
  newSlide,
  SHAPES,
  SLIDE_SIZE,
  SLIDE_TRANSITIONS,
  slideBlocks,
  slideId,
  slideTitle,
  textElement,
  visibleDeckSlides,
} from "./model.js";
export type {
  AnimationTrigger,
  AnimationType,
  BlockElement,
  CanvasElement,
  DeckAspect,
  DeckDocument,
  DeckSlide,
  DeckSource,
  DeckTheme,
  ElementKind,
  ElementStyle,
  ImageElement,
  ShapeElement,
  ShapeName,
  SlideAnimation,
  SlideElement,
  SlideTransition,
  SplitMode,
  TextElement,
} from "./model.js";

// Loading and checking stored decks (version 1 is upgraded).
export { deckProblems, toDeckDocument } from "./deck.js";
export { upgradeDeck, upgradeSlide } from "./upgrade.js";

// Presenting: the click timeline and moving through it.
export { slideSteps, slideTimeline, stepDuration, timelineCss } from "./timeline.js";
export type { TimedAnimation, TimelineCssOptions, TimelineStep } from "./timeline.js";
export { clampPosition, nextPosition, previousPosition } from "./navigation.js";
export type { DeckPosition } from "./navigation.js";

// Box geometry for the editor: handles, rotation, snapping.
export {
  boundsOf,
  boxesIntersect,
  boxFromPoints,
  centerOf,
  HANDLES,
  normalizeAngle,
  resizeBox,
  resizeCursor,
  resizeRotatedBox,
  rotatedBounds,
  rotatedCorners,
  rotatePoint,
  snapBox,
} from "./geometry.js";
export type { Box, Handle, Point, SnapResult } from "./geometry.js";

// Editing: pure deck, slide, object and animation operations.
export {
  addAnimation,
  addElements,
  addSlide,
  alignElements,
  animateParagraphs,
  copyForClipboard,
  DEFAULT_DURATION,
  distributeElements,
  duplicateElements,
  duplicateSlide,
  groupElements,
  moveAnimation,
  moveElements,
  moveSlide,
  pasteFromClipboard,
  pruneAnimations,
  removeAnimation,
  removeElements,
  removeSlide,
  reorderElements,
  SLIDE_TEMPLATES,
  slideFromTemplate,
  ungroupElements,
  updateAnimation,
  updateElements,
  updateSlide,
  withGroups,
} from "./ops.js";
export type { AlignEdge, LayerMove, SlideTemplate } from "./ops.js";

// Notes, projects, notebooks and slide markdown → decks.
export { deckFromNote, deckFromNotebook, deckFromProject, deckFromSlides, DEFAULT_CONVERT, splitSlideMarkdown } from "./convert.js";
export type { CanvasSlideRef, CanvasSource, ConvertOptions, NotebookEntry, NotebookSource, NoteSource, ProjectSource, SlideMarkdown } from "./convert.js";
export { canvasSlideRefs } from "./canvas-slides.js";

// "Let AI design it": the brief a model reads, the plan it answers with, and the deck built from it.
export { deckFromDesign, DESIGN_LIMITS, DESIGN_SCHEMA, DESIGN_SYSTEM, designBrief } from "./design.js";
export type { DesignBrief, DesignItem, SlideDesign } from "./design.js";
