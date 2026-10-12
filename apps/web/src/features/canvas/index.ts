// Client-safe barrel. Server fetchers live in ./api/canvases-api (server-only).
export { CanvasPane } from "./components/canvas-pane";
export { OctoCanvas } from "./components/octo-canvas-dynamic";
export {
  createCanvasClientApi,
  deleteCanvasClientApi,
  getCanvasSummaryClientApi,
  listCanvasesClientApi,
  listPickableCanvasesClientApi,
  moveCanvasClientApi,
  updateCanvasClientApi,
} from "./api/canvases-client-api";
export { canvasKeys, FIGURE_DROP_EVENT } from "./constants";
export {
  getFigureClientApi,
  listWorkspaceFiguresClientApi,
  type FigureSummary,
} from "./api/figures-client-api";
export type { Canvas, CanvasReferenceSummary, CanvasSummary } from "./types";
