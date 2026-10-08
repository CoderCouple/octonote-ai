import "server-only";
import { serverFetch } from "@/lib/api/server-fetch";
import type { Project, ProjectWithPair } from "../types";

export function listProjectsApi(workspaceId: string) {
  return serverFetch<Project[]>(`/workspaces/${workspaceId}/projects`);
}

export function getProjectApi(projectId: string) {
  return serverFetch<ProjectWithPair>(`/projects/${projectId}`);
}
