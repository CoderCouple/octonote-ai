"use client";

import {
  BookOpen,
  FileText,
  FolderKanban,
  LayoutGrid,
  Settings,
  Users,
} from "lucide-react";
import * as React from "react";

import { NavMain } from "@/components/nav-main";
import { NavUser } from "@/components/nav-user";
import { TeamSwitcher, type TeamSummary } from "@/components/team-switcher";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarRail,
} from "@/components/ui/sidebar";

interface AppSidebarProps extends React.ComponentProps<typeof Sidebar> {
  workspace: { id: string; name: string; slug: string };
  memberships: TeamSummary[];
  user: { name: string; email: string; avatarUrl: string | null };
}

export function AppSidebar({
  workspace,
  memberships,
  user,
  ...props
}: AppSidebarProps) {
  const navMain = [
    { title: "Notes", url: "/workspace/notes", icon: FileText },
    { title: "Canvases", url: "/workspace/canvases", icon: LayoutGrid },
    { title: "Projects", url: "/workspace/projects", icon: FolderKanban },
    { title: "Notebooks", url: "/workspace/notebooks", icon: BookOpen },
    { title: "Shared", url: "/workspace/shared", icon: Users },
  ];

  return (
    <Sidebar collapsible="icon" {...props}>
      <SidebarHeader className="border-sidebar-border border-b px-3 py-3">
        <TeamSwitcher activeWorkspaceId={workspace.id} teams={memberships} />
      </SidebarHeader>
      <SidebarContent className="pt-2">
        <NavMain items={navMain} />
      </SidebarContent>
      <SidebarFooter className="gap-1 pb-3">
        <NavMain
          items={[
            { title: "Settings", url: "/workspace/settings", icon: Settings },
          ]}
          className="p-0 px-1"
        />
        <NavUser
          user={{
            name: user.name,
            email: user.email,
            avatar: user.avatarUrl ?? "",
          }}
        />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
