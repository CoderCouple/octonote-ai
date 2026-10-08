export const notebookKeys = {
  all: ["notebooks"] as const,
  list: (workspaceId: string) => [...notebookKeys.all, "list", workspaceId] as const,
  contents: (notebookId: string) => [...notebookKeys.all, "contents", notebookId] as const,
};
