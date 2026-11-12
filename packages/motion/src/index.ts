export { CountUp, DrawPath, FadeIn, Highlight, ScaleIn, SlideIn, Stagger, Typewriter, cx, useCountUp, useInView, useReducedMotion } from "./primitives.js";
export { ScenePlayer } from "./player.js";
export type { ScenePlayerProps, Theme } from "./player.js";
export { outlineToolDefinition, SCENE_GUIDE, sceneOutlineSchema, sceneRequest, sceneToolDefinition } from "./ai.js";
export type { SceneOutline } from "./ai.js";
export { actionSchema, COLORS, elementSchema, LIMITS, parseScene, placement, SCHEMA_VERSION, sceneSchema, stepSchema, validateScene } from "./schema.js";
export type { ElementShape, Scene, SceneAction, SceneColor, SceneElement, SceneStep, SpecIssue, ValidationResult } from "./schema.js";
// The engine, for custom players, tests and export tools.
export { DARK_THEME, LIGHT_THEME, resolveColor } from "./engine/color.js";
export type { SceneTheme } from "./engine/color.js";
export { EASINGS } from "./engine/easing.js";
export type { Easing } from "./engine/easing.js";
export { bounds, circlePoints, morphPoints, pointAlong, rectPoints, regularPolygon, resample, smoothCurve } from "./engine/geometry.js";
export type { Point } from "./engine/geometry.js";
export { CANVAS, computeLayout } from "./engine/layout.js";
export type { Layout } from "./engine/layout.js";
export { renderFrame, texToText, UNIT } from "./engine/render.js";
export { compileScene, valueAt } from "./engine/timeline.js";
export type { CompiledScene } from "./engine/timeline.js";
