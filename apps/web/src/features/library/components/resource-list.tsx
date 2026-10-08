"use client";

import { BookOpen, FileText, FolderKanban, LayoutGrid, MoreHorizontal } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { ConfirmActionDialog } from "@/components/confirm-action-dialog";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { KIND_LABEL, RESOURCE_PATH, type ResourceKind } from "@/features/sharing";
import { deleteResource, moveResource } from "../operations";
import { MoveToNotebookDialog } from "./move-to-notebook-dialog";

export interface ResourceListItem {
  kind: ResourceKind;
  id: string;
  title: string;
  /** Second line: a content snippet, "in <notebook>", etc. */
  subtitle?: string;
  thumbnailUrl?: string | null;
  notebookId?: string | null;
  updatedAt: string;
}

const ICON: Record<ResourceKind, typeof FileText> = {
  page: FileText,
  canvas: LayoutGrid,
  project: FolderKanban,
  notebook: BookOpen,
};

const DELETE_COPY: Record<ResourceKind, string> = {
  page: "The note will be deleted for everyone it's shared with.",
  canvas: "The canvas will be deleted for everyone it's shared with. Notes that link to it will show it as unavailable.",
  project: "The project, its note and its canvas will be deleted for everyone they're shared with.",
  notebook: "Only the notebook is deleted. Everything inside moves back to the top level.",
};

interface ResourceListProps {
  workspaceId: string;
  items: ResourceListItem[];
  emptyMessage: string;
  /** Rendered in the header row next to the count (usually a CreateButton). */
  actions?: React.ReactNode;
  title?: string;
  /** Viewers: rows link only, no move/delete menu. */
  readOnly?: boolean;
}

export function ResourceList({
  workspaceId,
  items,
  emptyMessage,
  actions,
  title,
  readOnly = false,
}: ResourceListProps) {
  return (
    <section className="flex flex-col">
      {title || actions ? (
        <header className="flex items-center justify-between gap-4 px-6 py-5 md:px-8">
          {title ? (
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
              <p className="text-muted-foreground text-sm">
                {items.length} item{items.length === 1 ? "" : "s"}
              </p>
            </div>
          ) : (
            <span />
          )}
          {actions}
        </header>
      ) : null}
      {items.length === 0 ? (
        <p className="text-muted-foreground px-6 py-16 text-center text-sm md:px-8">{emptyMessage}</p>
      ) : (
        <ul className="divide-y border-y">
          {items.map((item) => (
            <ResourceRow
              key={`${item.kind}:${item.id}`}
              item={item}
              workspaceId={workspaceId}
              readOnly={readOnly}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

function ResourceRow({
  item,
  workspaceId,
  readOnly,
}: {
  item: ResourceListItem;
  workspaceId: string;
  readOnly: boolean;
}) {
  const router = useRouter();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [moving, setMoving] = useState(false);
  const Icon = ICON[item.kind];
  const href = RESOURCE_PATH[item.kind](item.id);
  const kind = item.kind;

  async function remove() {
    try {
      await deleteResource(kind, item.id);
      toast.success(`Deleted ${KIND_LABEL[kind]}.`);
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't delete.");
    }
  }

  return (
    <li className="hover:bg-accent/40 flex items-center gap-4 px-6 py-3 transition-colors md:px-8">
      <Link href={href} className="flex min-w-0 flex-1 items-center gap-4">
        <div className="bg-muted grid size-10 shrink-0 place-items-center overflow-hidden rounded-md border">
          {item.thumbnailUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={item.thumbnailUrl} alt="" className="h-full w-full object-cover" loading="lazy" />
          ) : (
            <Icon className="text-muted-foreground size-4" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{item.title || "Untitled"}</p>
          {item.subtitle ? (
            <p className="text-muted-foreground truncate text-xs">{item.subtitle}</p>
          ) : null}
        </div>
        <span className="text-muted-foreground hidden shrink-0 text-xs tabular-nums sm:inline">
          {new Date(item.updatedAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
        </span>
      </Link>
      {readOnly ? null : (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="sm" className="size-8 p-0" aria-label={`More actions for ${item.title}`}>
            <MoreHorizontal className="size-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem asChild>
            <Link href={href}>Open</Link>
          </DropdownMenuItem>
          {kind !== "notebook" ? (
            <DropdownMenuItem onSelect={() => setMoving(true)}>Move to notebook…</DropdownMenuItem>
          ) : null}
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" onSelect={() => setConfirmDelete(true)}>
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      )}
      <ConfirmActionDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title={`Delete “${item.title || "Untitled"}”?`}
        description={DELETE_COPY[kind]}
        onConfirm={remove}
      />
      {kind !== "notebook" ? (
        <MoveToNotebookDialog
          open={moving}
          onOpenChange={setMoving}
          workspaceId={workspaceId}
          currentNotebookId={item.notebookId ?? null}
          onMove={async (notebookId) => {
            await moveResource(kind, item.id, notebookId);
            toast.success(notebookId ? "Moved to notebook." : "Moved out of the notebook.");
            router.refresh();
          }}
        />
      ) : null}
    </li>
  );
}
