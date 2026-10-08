import { NotesPane } from "@/features/notes";
import { getNoteApi } from "@/features/notes/api/notes-api";
import { loadOrGate } from "@/lib/load-or-gate";
import { BackLink } from "../../_components/back-link";
import { NoAccess } from "../../_components/no-access";

export default async function NotePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const res = await loadOrGate(() => getNoteApi(id), `/n/${id}`);
  if (!res.ok) return <NoAccess />;
  const note = res.data;
  // A project's note opens inside its project.
  const back = note.projectId ? `/p/${note.projectId}` : note.notebookId ? `/nb/${note.notebookId}` : "/workspace/notes";
  return (
    <NotesPane
      note={note}
      myRole={note.myRole ?? "viewer"}
      leading={<BackLink href={back} signedIn={res.signedIn} />}
    />
  );
}
