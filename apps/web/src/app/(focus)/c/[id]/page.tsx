import { CanvasPane } from "@/features/canvas";
import { getCanvasApi } from "@/features/canvas/api/canvases-api";
import { loadOrGate } from "@/lib/load-or-gate";
import { BackLink } from "../../_components/back-link";
import { NoAccess } from "../../_components/no-access";

export default async function CanvasPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const res = await loadOrGate(() => getCanvasApi(id), `/c/${id}`);
  if (!res.ok) return <NoAccess />;
  const canvas = res.data;
  const back = canvas.projectId
    ? `/p/${canvas.projectId}`
    : canvas.notebookId
      ? `/nb/${canvas.notebookId}`
      : "/workspace/canvases";
  return (
    <CanvasPane
      canvas={canvas}
      myRole={canvas.myRole ?? "viewer"}
      leading={<BackLink href={back} signedIn={res.signedIn} />}
    />
  );
}
