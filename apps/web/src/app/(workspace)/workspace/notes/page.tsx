import { CreateButton, ResourceList } from "@/features/library";
import { listNotesApi } from "@/features/notes/api/notes-api";
import { listNotebooksApi } from "@/features/notebooks/api/notebooks-api";
import { activeWorkspaceId } from "../../_lib";

export default async function NotesPage() {
  const workspaceId = await activeWorkspaceId();
  if (!workspaceId) return null;
  const [notes, notebooks] = await Promise.all([listNotesApi(workspaceId), listNotebooksApi(workspaceId)]);
  const notebookName = new Map(notebooks.map((n) => [n.id, n.name]));
  return (
    <ResourceList
      title="Notes"
      workspaceId={workspaceId}
      actions={<CreateButton kind="page" workspaceId={workspaceId} />}
      emptyMessage="No notes yet. Create one to start writing."
      items={notes.map((n) => ({
        kind: "page",
        id: n.id,
        title: n.title,
        subtitle: n.notebookId
          ? `in ${notebookName.get(n.notebookId) ?? "a notebook"}`
          : n.contentMd.trim().slice(0, 140) || "Empty note",
        notebookId: n.notebookId,
        updatedAt: n.updatedAt,
      }))}
    />
  );
}
