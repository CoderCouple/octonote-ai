import { StudioHome } from "@/features/studio/studio-home";
import { activeWorkspaceId } from "../../_lib";

export const metadata = { title: "Studio" };

export default async function StudioPage() {
  const workspaceId = await activeWorkspaceId();
  if (!workspaceId) return null;
  return <StudioHome workspaceId={workspaceId} />;
}
