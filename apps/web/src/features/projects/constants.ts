export const projectKeys = {
  all: ["projects"] as const,
  list: (workspaceId: string) => [...projectKeys.all, "list", workspaceId] as const,
};
