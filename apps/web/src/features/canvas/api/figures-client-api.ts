/** Canvas figures API (no canvas engine imports — safe for the notes bundle). */
import { clientApi } from "@/lib/api/client-fetch";

export interface FigureSummary {
  id: string;
  canvasId: string;
  canvasTitle?: string;
  title: string;
  /** The figure's page, /f/<id>. */
  url: string;
  imageUrl: string | null;
  publishedAt: string | null;
  width: number;
  height: number;
  contentHash: string | null;
  updatedAt: string;
}

/** One figure as you may see it: the canvas only appears if you can reach it. */
export interface FigureView extends Omit<FigureSummary, "canvasId"> {
  canvasId: string | null;
  canvasHref: string | null;
  canPublish: boolean;
  /** Anyone can open it, signed out. */
  public: boolean;
  canEdit: boolean;
  /** What to draw, when the picture is missing and this viewer can make it. */
  draw: { source: string; placements?: unknown } | null;
}

export function listCanvasFiguresClientApi(canvasId: string) {
  return clientApi.get<FigureSummary[]>(`/canvases/${canvasId}/figures`);
}

export function listWorkspaceFiguresClientApi(workspaceId: string) {
  return clientApi.get<FigureSummary[]>(`/workspaces/${workspaceId}/figures`);
}

export function getFigureClientApi(figureId: string) {
  return clientApi.get<FigureView>(`/figures/${figureId}`);
}

export function setFigurePublishedClientApi(figureId: string, published: boolean) {
  const path = `/figures/${figureId}/publish`;
  return published ? clientApi.post<FigureView>(path, {}) : clientApi.delete<FigureView>(path);
}
