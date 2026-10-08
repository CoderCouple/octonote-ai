"use client";

import { useQuery } from "@tanstack/react-query";
import { BookOpen, Check, Inbox } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { listNotebooksClientApi } from "@/features/notebooks/api/notebooks-client-api";
import { notebookKeys } from "@/features/notebooks/constants";
import { cn } from "@/lib/utils";

interface MoveToNotebookDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workspaceId: string;
  currentNotebookId: string | null;
  onMove: (notebookId: string | null) => Promise<void>;
}

export function MoveToNotebookDialog({
  open,
  onOpenChange,
  workspaceId,
  currentNotebookId,
  onMove,
}: MoveToNotebookDialogProps) {
  const notebooks = useQuery({
    queryKey: notebookKeys.list(workspaceId),
    queryFn: () => listNotebooksClientApi(workspaceId),
    enabled: open,
  });
  const [target, setTarget] = useState<string | null>(currentNotebookId);
  const [busy, setBusy] = useState(false);

  async function confirm() {
    setBusy(true);
    try {
      await onMove(target);
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't move.");
    } finally {
      setBusy(false);
    }
  }

  const options = [
    { id: null, name: "No notebook", icon: Inbox },
    ...(notebooks.data ?? []).map((n) => ({ id: n.id, name: n.name, icon: BookOpen })),
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Move to notebook</DialogTitle>
          <DialogDescription>
            Anyone the notebook is shared with gets the same access to this item, and if the notebook is published, this item becomes public too.
          </DialogDescription>
        </DialogHeader>
        <ul className="flex max-h-72 flex-col gap-1 overflow-auto">
          {options.map((o) => (
            <li key={o.id ?? "none"}>
              <button
                type="button"
                onClick={() => setTarget(o.id)}
                className={cn(
                  "hover:bg-accent flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm",
                  target === o.id && "bg-accent",
                )}
              >
                <o.icon className="size-4 shrink-0" />
                <span className="flex-1 truncate">{o.name}</span>
                {target === o.id ? <Check className="size-4" /> : null}
              </button>
            </li>
          ))}
        </ul>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={confirm} disabled={busy || target === currentNotebookId}>
            Move
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
