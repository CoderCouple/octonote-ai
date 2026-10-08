"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { runAction } from "@/lib/api/action";
import {
  createWorkspaceApi,
  deleteWorkspaceApi,
  updateWorkspaceApi,
} from "../api/workspaces-api";
import { ACTIVE_WORKSPACE_COOKIE } from "../constants";

/**
 * Read the active-workspace cookie. Used by RSCs and other server actions
 * — exported so route components don't need to know the cookie name.
 */
export async function getActiveWorkspaceIdCookie(): Promise<string | null> {
  const store = await cookies();
  return store.get(ACTIVE_WORKSPACE_COOKIE)?.value ?? null;
}

export async function setActiveWorkspaceAction(workspaceId: string) {
  const store = await cookies();
  store.set(ACTIVE_WORKSPACE_COOKIE, workspaceId, {
    path: "/",
    httpOnly: false,
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 365,
  });
  revalidatePath("/", "layout");
}

export async function createWorkspaceAction(input: { name: string; slug?: string }) {
  return runAction(async () => {
    const workspace = await createWorkspaceApi(input);
    await setActiveWorkspaceAction(workspace.id);
    return workspace;
  });
}

export async function renameWorkspaceAction(id: string, name: string) {
  return runAction(() => updateWorkspaceApi(id, { name }));
}

export async function deleteWorkspaceAction(id: string) {
  return runAction(async () => {
    await deleteWorkspaceApi(id);
    const store = await cookies();
    store.delete(ACTIVE_WORKSPACE_COOKIE);
    revalidatePath("/", "layout");
  });
}
