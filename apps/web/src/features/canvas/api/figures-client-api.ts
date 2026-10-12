/** Canvas figures API (no tldraw imports — safe for the notes bundle). */
import { clientApi } from "@/lib/api/client-fetch";

export interface FigureSummary {
  id: string;
  canvasId: string;
  canvasTitle?: string;
  title: string;
  imageUrl: string | null;
  width: number;
  height: number;
  contentHash: string | null;
  updatedAt: string;
}

export function listCanvasFiguresClientApi(canvasId: string) {
  return clientApi.get<FigureSummary[]>(`/canvases/${canvasId}/figures`);
}

export function listWorkspaceFiguresClientApi(workspaceId: string) {
  return clientApi.get<FigureSummary[]>(`/workspaces/${workspaceId}/figures`);
}

export function getFigureClientApi(figureId: string) {
  return clientApi.get<FigureSummary>(`/figures/${figureId}`);
}
