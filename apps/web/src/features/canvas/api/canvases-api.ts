import "server-only";
import { serverFetch } from "@/lib/api/server-fetch";
import type { Canvas, CanvasSummary } from "../types";

export function listCanvasesApi(workspaceId: string) {
  return serverFetch<CanvasSummary[]>(`/workspaces/${workspaceId}/canvases`);
}

export function getCanvasApi(canvasId: string) {
  return serverFetch<Canvas>(`/canvases/${canvasId}`);
}
