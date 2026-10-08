import { NotebookView } from "@/features/notebooks";
import { getNotebookApi } from "@/features/notebooks/api/notebooks-api";
import { loadOrGate } from "@/lib/load-or-gate";
import { BackLink } from "../../_components/back-link";
import { NoAccess } from "../../_components/no-access";

export default async function NotebookPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const res = await loadOrGate(() => getNotebookApi(id), `/nb/${id}`);
  if (!res.ok) return <NoAccess />;
  return (
    <NotebookView
      contents={res.data}
      myRole={res.data.notebook.myRole ?? "viewer"}
      leading={<BackLink href="/workspace/notebooks" signedIn={res.signedIn} />}
    />
  );
}
