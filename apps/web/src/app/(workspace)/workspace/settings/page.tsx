import {
  getActiveWorkspaceIdCookie,
  resolveActiveMembership,
} from "@/features/workspaces";
import { getMeApi } from "@/features/workspaces/api/workspaces-api";
import { SettingsPanel } from "./_components/settings-panel";

export default async function SettingsPage() {
  const me = await getMeApi();
  const activeId = await getActiveWorkspaceIdCookie();
  const active = resolveActiveMembership(me.memberships, activeId);
  if (!active) return null;

  const workspaceId = active.workspace.id;
  return (
    <SettingsPanel
      user={me.user}
      workspace={active.workspace}
      viewerRole={active.membership.role}
      memberships={me.memberships.map((m) => ({
        id: m.workspace.id,
        name: m.workspace.name,
        slug: m.workspace.slug,
        role: m.membership.role,
      }))}
      activeWorkspaceId={workspaceId}
    />
  );
}
