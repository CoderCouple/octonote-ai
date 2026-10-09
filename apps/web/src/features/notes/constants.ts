export const noteKeys = {
  all: ["notes"] as const,
  list: (workspaceId: string) =>
    [...noteKeys.all, "list", workspaceId] as const,
};
