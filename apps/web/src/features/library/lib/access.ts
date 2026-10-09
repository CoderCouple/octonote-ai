import type { Notebook } from "@octonote/shared";
import type { Access } from "../components/library-table";

interface SharingState {
  linkAccess: "restricted" | "anyone_with_link";
  publishedAt: string | null;
  sharedCount?: number;
}

/**
 * Most-open access wins, and publishing is inherited from the notebook at read
 * time (same rule as the API) — so an item in a published notebook is public.
 */
export function accessOf(
  item: SharingState,
  notebook?: Pick<Notebook, "publishedAt"> | null,
): Access {
  if (item.publishedAt || notebook?.publishedAt) return "public";
  if (item.linkAccess === "anyone_with_link") return "link";
  if ((item.sharedCount ?? 0) > 0) return "shared";
  return "private";
}

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
