import type { CreateStudioItemInput, StudioItem, StudioItemSummary, StudioStats } from "@octonote/shared";
import { clientApi } from "@/lib/api/client-fetch";

export interface StudioList {
  items: StudioItemSummary[];
  stats: StudioStats;
}

/** A note, canvas or project to use as a source. */
export interface SourceCandidate {
  id: string;
  kind: "note" | "canvas" | "project";
  title: string;
  updatedAt: string;
  notebook: string | null;
}

export const studioApi = {
  list: (workspaceId: string) => clientApi.get<StudioList>(`/studio?workspaceId=${encodeURIComponent(workspaceId)}`),
  create: (input: CreateStudioItemInput) => clientApi.post<StudioItem>("/studio", input),
  get: (id: string) => clientApi.get<StudioItem>(`/studio/${encodeURIComponent(id)}`),
  rename: (id: string, title: string) => clientApi.patch<StudioItem>(`/studio/${encodeURIComponent(id)}`, { title }),
  remove: (id: string) => clientApi.delete<void>(`/studio/${encodeURIComponent(id)}`),
  retry: (id: string) => clientApi.post<StudioItem>(`/studio/${encodeURIComponent(id)}/retry`, {}),
  publish: (id: string, on: boolean) =>
    on ? clientApi.put<StudioItem>(`/studio/${encodeURIComponent(id)}/publish`, {}) : clientApi.delete<StudioItem>(`/studio/${encodeURIComponent(id)}/publish`),
  addToNote: (id: string, body: { noteId?: string; workspaceId?: string }) =>
    clientApi.post<{ id: string; title: string; url: string }>(`/studio/${encodeURIComponent(id)}/note`, body),
  /** Notes, canvases and projects in the workspace, newest first or matching `q`. */
  sources: (workspaceId: string, q: string) =>
    clientApi.get<SourceCandidate[]>(`/extension/items?workspaceId=${encodeURIComponent(workspaceId)}&limit=30${q ? `&q=${encodeURIComponent(q)}` : ""}`),
};

/** An API error as a person should read it: without the "Octonote API /path 503:" prefix. */
export function errorText(error: unknown): string {
  return String((error as Error)?.message ?? error).replace(/^Octonote API \S+ \d{3}: /, "");
}

/** Errors that a key in Settings → AI fixes. */
export const needsAiKey = (message: string | null | undefined) => !!message && message.includes("Settings → AI");

export const AI_SETTINGS_PATH = "/workspace/settings#ai";
