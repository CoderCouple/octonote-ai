import { clientApi } from "@/lib/api/client-fetch";
import type { Canvas, CanvasCreate, CanvasReferenceSummary, CanvasSummary, CanvasUpdate } from "../types";

export function createCanvasClientApi(workspaceId: string, body: CanvasCreate) {
  return clientApi.post<Canvas>(`/workspaces/${workspaceId}/canvases`, body);
}

export function updateCanvasClientApi(canvasId: string, body: CanvasUpdate) {
  return clientApi.patch<Canvas>(`/canvases/${canvasId}`, body);
}

export function deleteCanvasClientApi(canvasId: string) {
  return clientApi.delete<Canvas>(`/canvases/${canvasId}`);
}

export function moveCanvasClientApi(canvasId: string, notebookId: string | null) {
  return clientApi.post<Canvas>(`/canvases/${canvasId}/move`, { notebookId });
}

export function listCanvasesClientApi(workspaceId: string) {
  return clientApi.get<CanvasSummary[]>(`/workspaces/${workspaceId}/canvases`);
}

export function listPickableCanvasesClientApi(workspaceId: string) {
  return clientApi.get<CanvasSummary[]>(`/workspaces/${workspaceId}/canvases/pickable`);
}

export function getCanvasSummaryClientApi(canvasId: string) {
  return clientApi.get<CanvasReferenceSummary>(`/canvases/${canvasId}/summary`);
}
