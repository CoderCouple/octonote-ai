import { clientApi } from "@/lib/api/client-fetch";
import type { Project, ProjectCreate, ProjectUpdate, ProjectWithPair } from "../types";

export function createProjectClientApi(workspaceId: string, body: ProjectCreate) {
  return clientApi.post<ProjectWithPair>(`/workspaces/${workspaceId}/projects`, body);
}

export function updateProjectClientApi(projectId: string, body: ProjectUpdate) {
  return clientApi.patch<Project>(`/projects/${projectId}`, body);
}

export function archiveProjectClientApi(projectId: string) {
  return clientApi.delete<Project>(`/projects/${projectId}`);
}

export function moveProjectClientApi(projectId: string, notebookId: string | null) {
  return clientApi.post<Project>(`/projects/${projectId}/move`, { notebookId });
}

export function listProjectsClientApi(workspaceId: string) {
  return clientApi.get<Project[]>(`/workspaces/${workspaceId}/projects`);
}
