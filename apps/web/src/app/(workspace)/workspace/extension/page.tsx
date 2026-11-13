import { getMeApi } from "@/features/workspaces/api/workspaces-api";
import {
  resolveActiveMembership,
  getActiveWorkspaceIdCookie,
} from "@/features/workspaces";
import { ConnectExtension } from "@/features/collections/connect-extension";

/**
 * Opened by the Octonote Clipper side panel as
 * /workspace/extension?challenge=<base64url(sha256(verifier))>, plus
 * `&read=1` when it asks to read notes, canvases and projects too.
 */
export default async function ExtensionPage({
  searchParams,
}: {
  searchParams: Promise<{
    challenge?: string | string[];
    read?: string | string[];
  }>;
}) {
  const [me, activeId, params] = await Promise.all([
    getMeApi(),
    getActiveWorkspaceIdCookie(),
    searchParams,
  ]);
  const active = resolveActiveMembership(me.memberships, activeId);
  if (!active) return null;
  const challenge =
    typeof params.challenge === "string" ? params.challenge : null;
  return (
    <ConnectExtension
      workspaceId={active.workspace.id}
      workspaceName={active.workspace.name}
      challenge={challenge}
      read={params.read === "1"}
    />
  );
}
