import "server-only";
import { serverFetch } from "@/lib/api/server-fetch";
import type { Notebook, NotebookContents } from "../types";

export function listNotebooksApi(workspaceId: string) {
  return serverFetch<Notebook[]>(`/workspaces/${workspaceId}/notebooks`);
}

export function getNotebookApi(notebookId: string) {
  return serverFetch<NotebookContents>(`/notebooks/${notebookId}`);
}
