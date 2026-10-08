import "server-only";
import { serverFetch } from "@/lib/api/server-fetch";
import type {
  MeResponse,
  Workspace,
  WorkspaceCreate,
  WorkspaceUpdate,
} from "../types";

export function getMeApi() {
  return serverFetch<MeResponse>("/me");
}

export function createWorkspaceApi(body: WorkspaceCreate) {
  return serverFetch<Workspace>("/workspaces", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function updateWorkspaceApi(id: string, body: WorkspaceUpdate) {
  return serverFetch<Workspace>(`/workspaces/${id}`, {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}

export function deleteWorkspaceApi(id: string) {
  return serverFetch<{ ok: true }>(`/workspaces/${id}`, { method: "DELETE" });
}
