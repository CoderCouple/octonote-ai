import type { AnimationTrigger, AnimationType, DeckTheme, ShapeName, SlideTransition } from "@octonote/slides";
import type { SlideTemplate } from "@octonote/slides";

export const TEMPLATE_LABEL: Record<SlideTemplate, string> = {
  title: "Title",
  section: "Section",
  content: "Title and text",
  split: "Text and block",
  media: "Title and block",
  blank: "Blank",
};

export const TRANSITION_LABEL: Record<SlideTransition, string> = {
  none: "None",
  fade: "Fade",
  push: "Push",
  zoom: "Zoom",
  morph: "Morph (moves matching objects)",
};

export const ANIMATION_TYPE_LABEL: Record<AnimationType, string> = { in: "Entrance", emphasis: "Emphasis", out: "Exit" };

export const EFFECT_LABEL: Record<string, string> = {
  appear: "Appear",
  fade: "Fade in",
  rise: "Rise",
  drop: "Drop in",
  "fly-left": "Fly in from left",
  "fly-right": "Fly in from right",
  zoom: "Zoom in",
  pop: "Pop",
  wipe: "Wipe",
  blur: "Blur in",
  pulse: "Pulse",
  highlight: "Highlight",
  grow: "Grow",
  shake: "Shake",
  spin: "Spin",
  flash: "Flash",
  disappear: "Disappear",
  "fade-out": "Fade out",
  sink: "Sink",
  "fly-out-left": "Fly out to left",
  "fly-out-right": "Fly out to right",
  "zoom-out": "Zoom out",
};

export const TRIGGER_LABEL: Record<AnimationTrigger, string> = { click: "On click", with: "With previous", after: "After previous" };

export const THEME_LABEL: Record<DeckTheme, string> = {
  paper: "Paper",
  ink: "Ink",
  chalk: "Chalkboard",
  ocean: "Ocean",
  sunset: "Sunset",
  contrast: "High contrast",
};

export const SHAPE_LABEL: Record<ShapeName, string> = {
  rect: "Rectangle",
  rounded: "Rounded rectangle",
  ellipse: "Ellipse",
  triangle: "Triangle",
  diamond: "Diamond",
  arrow: "Arrow",
  line: "Line",
};
