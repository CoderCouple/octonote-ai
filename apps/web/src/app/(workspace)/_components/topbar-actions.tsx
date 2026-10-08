"use client";

import {
  Archive,
  Download,
  MoreHorizontal,
  Settings,
  Share2,
  Sparkles,
  Trash2,
  UserPlus,
} from "lucide-react";
import { usePathname } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface ActionItem {
  label: string;
  icon: typeof Settings;
  destructive?: boolean;
}

interface ActionGroup {
  title: string;
  items: ActionItem[];
}

function getGroupsForRoute(pathname: string): { title: string; groups: ActionGroup[] } {
  if (pathname === "/workspace/canvas") {
    return {
      title: "Canvas",
      groups: [
        {
          title: "File",
          items: [
            { label: "Export PNG", icon: Download },
            { label: "Export JSON", icon: Download },
            { label: "Share", icon: Share2 },
          ],
        },
        {
          title: "AI",
          items: [{ label: "Generate from prompt", icon: Sparkles }],
        },
        {
          title: "Danger",
          items: [{ label: "Clear canvas", icon: Trash2, destructive: true }],
        },
      ],
    };
  }

  if (pathname.startsWith("/project/")) {
    return {
      title: "Project",
      groups: [
        {
          title: "Project",
          items: [
            { label: "Project settings", icon: Settings },
            { label: "Invite collaborator", icon: UserPlus },
            { label: "Share", icon: Share2 },
          ],
        },
        {
          title: "Danger",
          items: [{ label: "Archive project", icon: Archive, destructive: true }],
        },
      ],
    };
  }

  return {
    title: "Workspace",
    groups: [
      {
        title: "Workspace",
        items: [
          { label: "Workspace settings", icon: Settings },
          { label: "Invite collaborator", icon: UserPlus },
        ],
      },
    ],
  };
}

export function TopbarActions() {
  const pathname = usePathname();
  const { title, groups } = getGroupsForRoute(pathname);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" className="gap-2">
          <MoreHorizontal className="h-4 w-4" />
          {title}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        {groups.map((group, gi) => (
          <div key={group.title}>
            {gi > 0 && <DropdownMenuSeparator />}
            <DropdownMenuLabel className="text-muted-foreground text-xs">
              {group.title}
            </DropdownMenuLabel>
            {group.items.map((item) => (
              <DropdownMenuItem
                key={item.label}
                className={item.destructive ? "text-destructive focus:text-destructive" : ""}
              >
                <item.icon className="h-4 w-4" />
                {item.label}
              </DropdownMenuItem>
            ))}
          </div>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
