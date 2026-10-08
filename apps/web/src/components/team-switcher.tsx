"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Check, ChevronsUpDown, Focus, Loader2, Plus } from "lucide-react";

import {
  createWorkspaceAction,
  setActiveWorkspaceAction,
} from "@/features/workspaces";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";

export interface TeamSummary {
  id: string;
  name: string;
  slug: string;
  role: "OWNER" | "ADMIN" | "MEMBER";
}

interface TeamSwitcherProps {
  activeWorkspaceId: string;
  teams: TeamSummary[];
}

export function TeamSwitcher({ activeWorkspaceId, teams }: TeamSwitcherProps) {
  const { isMobile } = useSidebar();
  const router = useRouter();
  const [pendingSwitch, setPendingSwitch] = React.useState<string | null>(null);
  const [createOpen, setCreateOpen] = React.useState(false);

  const active = teams.find((t) => t.id === activeWorkspaceId) ?? teams[0];
  if (!active) return null;

  const handleSwitch = async (workspaceId: string) => {
    if (workspaceId === active.id) return;
    setPendingSwitch(workspaceId);
    try {
      await setActiveWorkspaceAction(workspaceId);
      router.refresh();
    } finally {
      setPendingSwitch(null);
    }
  };

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton
              size="lg"
              className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground group-data-[collapsible=icon]:!size-12 group-data-[collapsible=icon]:!p-2"
            >
              <div className="bg-sidebar-primary text-sidebar-primary-foreground flex aspect-square size-8 items-center justify-center rounded-lg group-data-[collapsible=icon]:size-7">
                <Focus className="size-3.5" />
              </div>
              <div className="grid flex-1 text-left text-sm leading-tight">
                <span className="truncate font-medium">{active.name}</span>
                <span className="text-muted-foreground truncate text-xs">
                  {active.role.toLowerCase()}
                </span>
              </div>
              <ChevronsUpDown className="ml-auto" />
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            className="w-(--radix-dropdown-menu-trigger-width) min-w-56 rounded-lg"
            align="start"
            side={isMobile ? "bottom" : "right"}
            sideOffset={4}
          >
            <DropdownMenuLabel className="text-muted-foreground text-xs">
              Workspaces
            </DropdownMenuLabel>
            {teams.map((team) => {
              const isActive = team.id === active.id;
              const isLoading = pendingSwitch === team.id;
              return (
                <DropdownMenuItem
                  key={team.id}
                  onClick={() => handleSwitch(team.id)}
                  className="gap-2 p-2"
                  disabled={isLoading}
                >
                  <div className="flex size-6 items-center justify-center rounded-md border">
                    <Focus className="size-3.5 shrink-0" />
                  </div>
                  <div className="flex-1 truncate">{team.name}</div>
                  {isLoading ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : isActive ? (
                    <Check className="size-3.5" />
                  ) : null}
                </DropdownMenuItem>
              );
            })}
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="gap-2 p-2"
              onClick={(e) => {
                e.preventDefault();
                setCreateOpen(true);
              }}
            >
              <div className="bg-background flex size-6 items-center justify-center rounded-md border">
                <Plus className="size-4" />
              </div>
              <div className="text-muted-foreground font-medium">Create workspace</div>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
      <CreateWorkspaceDialog open={createOpen} onOpenChange={setCreateOpen} />
    </SidebarMenu>
  );
}

function CreateWorkspaceDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const [name, setName] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const reset = () => {
    setName("");
    setError(null);
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    setError(null);
    const r = await createWorkspaceAction({ name: name.trim() });
    setBusy(false);
    if (!r.success) {
      setError(r.message);
      return;
    }
    reset();
    onOpenChange(false);
    router.refresh();
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
        if (!next) reset();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New workspace</DialogTitle>
          <DialogDescription>
            Workspaces group your projects, members, and AI agents. You become the owner.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleCreate} className="grid gap-3">
          <div className="grid gap-1.5">
            <Label htmlFor="workspace-name">Name</Label>
            <Input
              id="workspace-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
              maxLength={120}
              placeholder="Acme HQ"
              disabled={busy}
            />
          </div>
          {error ? <p className="text-destructive text-xs">{error}</p> : null}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={busy}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={busy || !name.trim()}>
              {busy ? <Loader2 className="size-4 animate-spin" /> : null}
              Create
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
