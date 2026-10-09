import { LibraryTable } from "@/features/library";
import type { SharedWithMeItem } from "@/features/sharing";
import { serverFetch } from "@/lib/api/server-fetch";
import { activeWorkspaceId } from "../../_lib";

export default async function SharedWithMePage() {
  const workspaceId = await activeWorkspaceId();
  if (!workspaceId) return null;
  const items = await serverFetch<SharedWithMeItem[]>("/me/shared");
  return (
    <LibraryTable
      workspaceId={workspaceId}
      noun="items"
      readOnly
      emptyMessage="Nothing has been shared with you yet. When someone shares a note, canvas, project or notebook with your email, it shows up here."
      rows={items.map((i) => ({
        kind: i.kind,
        id: i.id,
        title: i.title,
        access: "shared",
        roleLabel: i.role === "editor" ? "Can edit" : "Can view",
        sharedCount: 0,
        owner: null,
        createdAt: i.sharedAt,
        updatedAt: i.sharedAt,
      }))}
    />
  );
}
