import type { BuildEffect, DeckTheme, SlideLayout, SlideTransition } from "@octonote/slides";

export const LAYOUT_LABEL: Record<SlideLayout, string> = {
  title: "Title",
  section: "Section",
  content: "Text",
  split: "Text and block",
  media: "One big block",
  canvas: "Canvas",
  blank: "Blank",
};

export const TRANSITION_LABEL: Record<SlideTransition, string> = {
  none: "None",
  fade: "Fade",
  push: "Push",
  zoom: "Zoom",
  morph: "Morph (moves matching blocks)",
};

export const EFFECT_LABEL: Record<BuildEffect, string> = {
  appear: "Appear",
  fade: "Fade in",
  rise: "Rise",
  wipe: "Wipe",
  highlight: "Highlight",
};

export const THEME_LABEL: Record<DeckTheme, string> = {
  paper: "Paper",
  ink: "Ink",
  chalk: "Chalkboard",
  ocean: "Ocean",
  sunset: "Sunset",
  contrast: "High contrast",
};
