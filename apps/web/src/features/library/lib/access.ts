import { accessOf, type Notebook } from "@octonote/shared";

export { accessOf };

/** Notebook name + "published via" for an item's notebookId. */
export function notebookLookup(notebooks: Notebook[]) {
  const byId = new Map(notebooks.map((n) => [n.id, n]));
  return (
    notebookId: string | null | undefined,
    item: { publishedAt: string | null },
  ) => {
    const nb = notebookId ? byId.get(notebookId) : undefined;
    return {
      notebook: nb ?? null,
      notebookName: nb?.name ?? null,
      publishedVia: !item.publishedAt && nb?.publishedAt ? nb.name : null,
    };
  };
}
