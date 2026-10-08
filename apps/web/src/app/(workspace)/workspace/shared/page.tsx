import { ResourceList } from "@/features/library";
import type { SharedWithMeItem } from "@/features/sharing";
import { serverFetch } from "@/lib/api/server-fetch";
import { activeWorkspaceId } from "../../_lib";

export default async function SharedWithMePage() {
  const workspaceId = await activeWorkspaceId();
  if (!workspaceId) return null;
  const items = await serverFetch<SharedWithMeItem[]>("/me/shared");
  return (
    <ResourceList
      title="Shared"
      workspaceId={workspaceId}
      readOnly
      emptyMessage="Nothing has been shared with you yet. When someone shares a note, canvas, project or notebook with your email, it shows up here."
      items={items.map((i) => ({
        kind: i.kind,
        id: i.id,
        title: i.title,
        subtitle: i.role === "editor" ? "Can edit" : "Can view",
        updatedAt: i.sharedAt,
      }))}
    />
  );
}
