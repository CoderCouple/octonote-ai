export const workspaceKeys = {
  all: ["workspaces"] as const,
  me: () => [...workspaceKeys.all, "me"] as const,
  detail: (workspaceId: string) => [...workspaceKeys.all, "detail", workspaceId] as const,
  members: (workspaceId: string) =>
    [...workspaceKeys.all, "members", workspaceId] as const,
};

/**
 * Cookie that stores the user's currently-selected workspace. Set via the
 * `setActiveWorkspaceAction` server action so it's available to RSCs on
 * the next request.
 */
export const ACTIVE_WORKSPACE_COOKIE = "of_active_workspace";
