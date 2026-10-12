"use client";

import {
  BookOpen,
  ChevronDown,
  FileText,
  FolderKanban,
  LayoutGrid,
  Loader2,
  Plus,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { ResourceKind } from "@/features/sharing";
import { createResource } from "../operations";

const LABEL: Record<ResourceKind, string> = {
  page: "New note",
  canvas: "New canvas",
  project: "New project",
  notebook: "New notebook",
};

const KIND_ICON: Record<ResourceKind, typeof FileText> = {
  page: FileText,
  canvas: LayoutGrid,
  project: FolderKanban,
  notebook: BookOpen,
};

const MENU_LABEL: Record<ResourceKind, string> = {
  page: "Note",
  canvas: "Canvas",
  project: "Project",
  notebook: "Notebook",
};

/** One click: create an "Untitled" resource and open it; rename happens inline there. */
export function CreateButton({
  kind,
  workspaceId,
  notebookId,
  variant = "default",
}: {
  kind: ResourceKind;
  workspaceId: string;
  notebookId?: string;
  variant?: "default" | "outline";
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function create() {
    setPending(true);
    try {
      router.push(await createResource(kind, workspaceId, notebookId));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't create.");
      setPending(false);
    }
  }

  return (
    <Button
      variant={variant}
      onClick={create}
      disabled={pending}
      className="gap-1.5"
    >
      {pending ? (
        <Loader2 className="size-4 animate-spin" />
      ) : (
        <Plus className="size-4" />
      )}
      {LABEL[kind]}
    </Button>
  );
}

/** "New ▾" menu for places that hold several kinds (inside a notebook). */
export function CreateMenu({
  kinds,
  workspaceId,
  notebookId,
}: {
  kinds: ResourceKind[];
  workspaceId: string;
  notebookId?: string;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function create(kind: ResourceKind) {
    setPending(true);
    try {
      router.push(await createResource(kind, workspaceId, notebookId));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't create.");
      setPending(false);
    }
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button disabled={pending} className="gap-1.5">
          {pending ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Plus className="size-4" />
          )}
          New
          <ChevronDown className="size-4 opacity-70" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-44">
        {kinds.map((kind) => {
          const Icon = KIND_ICON[kind];
          return (
            <DropdownMenuItem key={kind} onSelect={() => create(kind)}>
              <Icon className="size-4" />
              {MENU_LABEL[kind]}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
