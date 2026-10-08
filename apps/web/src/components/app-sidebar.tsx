"use client";

import { BookOpen, FileText, FolderKanban, LayoutGrid, Settings, Users } from "lucide-react";
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

export function AppSidebar({ workspace, memberships, user, ...props }: AppSidebarProps) {
  const navMain = [
    { title: "Notes", url: "/workspace/notes", icon: FileText },
    { title: "Canvases", url: "/workspace/canvases", icon: LayoutGrid },
    { title: "Projects", url: "/workspace/projects", icon: FolderKanban },
    { title: "Notebooks", url: "/workspace/notebooks", icon: BookOpen },
    { title: "Shared", url: "/workspace/shared", icon: Users },
    { title: "Settings", url: "/workspace/settings", icon: Settings },
  ];

  return (
    <Sidebar collapsible="icon" {...props}>
      <SidebarHeader>
        <TeamSwitcher activeWorkspaceId={workspace.id} teams={memberships} />
      </SidebarHeader>
      <SidebarContent>
        <NavMain items={navMain} />
      </SidebarContent>
      <SidebarFooter>
        <NavUser
          user={{ name: user.name, email: user.email, avatar: user.avatarUrl ?? "" }}
        />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
