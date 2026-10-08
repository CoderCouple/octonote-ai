import type { Canvas, CanvasCreate, CanvasUpdate } from "@octonote/shared";

export type { Canvas, CanvasCreate, CanvasUpdate };

/** Row from `GET /workspaces/:id/canvases` (and `/pickable`, which adds project canvases). */
export interface CanvasSummary {
  id: string;
  title: string;
  projectId: string | null;
  projectName: string | null;
  notebookId: string | null;
  thumbnailUrl: string | null;
  createdAt: string;
  updatedAt: string;
  creator: { id: string; name: string; email: string } | null;
}

/** `GET /canvases/:id/summary` — what the notes canvas-reference block renders. */
export interface CanvasReferenceSummary {
  id: string;
  title: string;
  thumbnailUrl: string | null;
  projectId: string | null;
}
