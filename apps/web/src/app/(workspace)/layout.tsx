import { redirect } from "next/navigation";
import { AppSidebar } from "@/components/app-sidebar";
import { WorkspaceBreadcrumbs } from "@/components/workspace-breadcrumbs";
import { Separator } from "@/components/ui/separator";
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import {
  getActiveWorkspaceIdCookie,
  resolveActiveMembership,
} from "@/features/workspaces";
import { getMeApi } from "@/features/workspaces/api/workspaces-api";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export default async function WorkspaceLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const me = await getMeApi();
  const activeId = await getActiveWorkspaceIdCookie();
  const active = resolveActiveMembership(me.memberships, activeId);

  if (!active) {
    return (
      <main className="grid min-h-screen place-items-center p-8 text-sm text-muted-foreground">
        No workspace found. Sign out and back in to bootstrap one.
      </main>
    );
  }

  return (
    <SidebarProvider>
      <AppSidebar
        workspace={active.workspace}
        memberships={me.memberships.map((m) => ({
          id: m.workspace.id,
          name: m.workspace.name,
          slug: m.workspace.slug,
          role: m.membership.role,
        }))}
        user={me.user}
      />
      <SidebarInset>
        {/* Slim top bar: sidebar toggle + where you are. Theme lives in the profile menu. */}
        <header className="bg-background flex h-12 shrink-0 items-center gap-2 border-b px-3 md:px-4">
          <SidebarTrigger className="text-muted-foreground hover:text-foreground-strong size-8" />
          <Separator orientation="vertical" className="mr-1 !h-4" />
          <WorkspaceBreadcrumbs workspaceName={active.workspace.name} />
        </header>
        <div className="flex-1 overflow-auto">{children}</div>
      </SidebarInset>
    </SidebarProvider>
  );
}
