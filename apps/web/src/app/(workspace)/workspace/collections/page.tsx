import { CollectionsList } from "@/features/collections/collections-list";
import { activeWorkspaceId } from "../../_lib";

export default async function CollectionsPage() {
  const workspaceId = await activeWorkspaceId();
  if (!workspaceId) return null;
  return <CollectionsList workspaceId={workspaceId} />;
}
