import { clientApi } from "@/lib/api/client-fetch";
import type { NoteSummary, Page, PageCreate, PageUpdate } from "../types";

export function createNoteClientApi(workspaceId: string, body: PageCreate) {
  return clientApi.post<Page>(`/workspaces/${workspaceId}/pages`, body);
}

export function updateNoteClientApi(pageId: string, body: PageUpdate) {
  return clientApi.patch<Page>(`/pages/${pageId}`, body);
}

export function deleteNoteClientApi(pageId: string) {
  return clientApi.delete<Page>(`/pages/${pageId}`);
}

export function moveNoteClientApi(pageId: string, notebookId: string | null) {
  return clientApi.post<Page>(`/pages/${pageId}/move`, { notebookId });
}

export function listNotesClientApi(workspaceId: string) {
  return clientApi.get<NoteSummary[]>(`/workspaces/${workspaceId}/pages`);
}
