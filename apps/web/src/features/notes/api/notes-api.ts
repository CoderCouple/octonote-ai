import "server-only";
import { serverFetch } from "@/lib/api/server-fetch";
import type { NoteSummary, Page } from "../types";

export function listNotesApi(workspaceId: string) {
  return serverFetch<NoteSummary[]>(`/workspaces/${workspaceId}/pages`);
}

export function getNoteApi(pageId: string) {
  return serverFetch<Page>(`/pages/${pageId}`);
}
