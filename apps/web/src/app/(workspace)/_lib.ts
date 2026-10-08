import "server-only";
import { getActiveWorkspaceIdCookie, resolveActiveMembership } from "@/features/workspaces";
import { getMeApi } from "@/features/workspaces/api/workspaces-api";

/** The signed-in user's active workspace id (cookie, else first membership). */
export async function activeWorkspaceId(): Promise<string | null> {
  const me = await getMeApi();
  const active = resolveActiveMembership(me.memberships, await getActiveWorkspaceIdCookie());
  return active?.workspace.id ?? null;
}
