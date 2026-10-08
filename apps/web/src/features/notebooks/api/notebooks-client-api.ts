import { clientApi } from "@/lib/api/client-fetch";
import type { Notebook, NotebookCreate, NotebookUpdate } from "../types";

export function createNotebookClientApi(workspaceId: string, body: NotebookCreate) {
  return clientApi.post<Notebook>(`/workspaces/${workspaceId}/notebooks`, body);
}

export function updateNotebookClientApi(notebookId: string, body: NotebookUpdate) {
  return clientApi.patch<Notebook>(`/notebooks/${notebookId}`, body);
}

export function deleteNotebookClientApi(notebookId: string) {
  return clientApi.delete<void>(`/notebooks/${notebookId}`);
}

export function listNotebooksClientApi(workspaceId: string) {
  return clientApi.get<Notebook[]>(`/workspaces/${workspaceId}/notebooks`);
}
