import {
  accessOf,
  CreateButton,
  LibraryTable,
  notebookLookup,
} from "@/features/library";
import { listNotesApi } from "@/features/notes/api/notes-api";
import { listNotebooksApi } from "@/features/notebooks/api/notebooks-api";
import { previewFromMarkdown } from "@octonote/shared";
import { activeWorkspaceId } from "../../_lib";

export default async function NotesPage() {
  const workspaceId = await activeWorkspaceId();
  if (!workspaceId) return null;
  const [notes, notebooks] = await Promise.all([
    listNotesApi(workspaceId),
    listNotebooksApi(workspaceId),
  ]);
  const lookup = notebookLookup(notebooks);
  return (
    <LibraryTable
      workspaceId={workspaceId}
      noun="notes"
      createAction={<CreateButton kind="page" workspaceId={workspaceId} />}
      emptyMessage="No notes yet. Create one to start writing."
      rows={notes.map((n) => {
        const { notebook, notebookName, publishedVia } = lookup(
          n.notebookId,
          n,
        );
        return {
          kind: "page",
          id: n.id,
          title: n.title,
          subtitle: previewFromMarkdown(n.contentMd, n.title) || "Empty note",
          notebookId: n.notebookId,
          notebookName,
          access: accessOf(n, notebook),
          publishedVia,
          sharedCount: n.sharedCount,
          owner: n.creator?.name ?? null,
          createdAt: n.createdAt,
          updatedAt: n.updatedAt,
        };
      })}
    />
  );
}
