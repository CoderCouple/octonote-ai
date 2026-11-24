import { listDecksApi } from "@/features/decks/api/decks-api";
import { accessOf, CreateButton, LibraryTable, notebookLookup } from "@/features/library";
import { listNotebooksApi } from "@/features/notebooks/api/notebooks-api";
import { activeWorkspaceId } from "../../_lib";

export default async function DecksPage() {
  const workspaceId = await activeWorkspaceId();
  if (!workspaceId) return null;
  const [decks, notebooks] = await Promise.all([listDecksApi(workspaceId), listNotebooksApi(workspaceId)]);
  const lookup = notebookLookup(notebooks);
  return (
    <LibraryTable
      workspaceId={workspaceId}
      noun="presentations"
      createAction={<CreateButton kind="deck" workspaceId={workspaceId} />}
      emptyKind="deck"
      emptyMessage="No presentations yet. Create one, or open a note, project or notebook and choose Make presentation."
      rows={decks.map((d) => {
        const { notebook, notebookName, publishedVia } = lookup(d.notebookId, d);
        return {
          kind: "deck",
          id: d.id,
          title: d.title,
          thumbnailUrl: null,
          notebookId: d.notebookId,
          notebookName,
          access: accessOf(d, notebook),
          publishedVia,
          sharedCount: d.sharedCount,
          owner: d.creator?.name ?? null,
          createdAt: d.createdAt,
          updatedAt: d.updatedAt,
        };
      })}
    />
  );
}
