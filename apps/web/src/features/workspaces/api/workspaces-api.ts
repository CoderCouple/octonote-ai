import "server-only";
import { cookies } from "next/headers";
import {
  SIGNUP_REF_COOKIE,
  SIGNUP_REF_HEADER,
} from "@/features/public/lib/signup-ref";
import { serverFetch } from "@/lib/api/server-fetch";
import type {
  MeResponse,
  Workspace,
  WorkspaceCreate,
  WorkspaceUpdate,
} from "../types";

/** Also tells the API where a brand-new account came from (see signup-ref.ts). */
export async function getMeApi() {
  const ref = (await cookies()).get(SIGNUP_REF_COOKIE)?.value;
  return serverFetch<MeResponse>(
    "/me",
    ref ? { headers: { [SIGNUP_REF_HEADER]: ref } } : {},
  );
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

/** What the signed-in user edited in this workspace, most recent first. */
export function listRecentApi(workspaceId: string) {
  return serverFetch<
    {
      kind: "page" | "canvas" | "project" | "notebook";
      id: string;
      lastEditedAt: string;
    }[]
  >(`/workspaces/${workspaceId}/recent`);
}
