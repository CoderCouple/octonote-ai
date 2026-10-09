"use client";

import { useQuery } from "@tanstack/react-query";
import { LayoutGrid } from "lucide-react";
import { useMemo, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { canvasKeys, listPickableCanvasesClientApi } from "@/features/canvas";

interface CanvasPickerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workspaceId: string;
  onPick: (canvasId: string) => void;
}

export function CanvasPickerDialog({
  open,
  onOpenChange,
  workspaceId,
  onPick,
}: CanvasPickerDialogProps) {
  const [query, setQuery] = useState("");
  const canvases = useQuery({
    queryKey: canvasKeys.pickable(workspaceId),
    queryFn: () => listPickableCanvasesClientApi(workspaceId),
    enabled: open,
  });

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    const rows = canvases.data ?? [];
    if (!q) return rows;
    return rows.filter(
      (c) =>
        c.title.toLowerCase().includes(q) ||
        c.projectName?.toLowerCase().includes(q),
    );
  }, [canvases.data, query]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Insert a canvas</DialogTitle>
          <DialogDescription>
            Readers see a preview and can click through to the canvas.
          </DialogDescription>
        </DialogHeader>
        <Input
          autoFocus
          placeholder="Search canvases"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Search canvases"
        />
        <div className="grid max-h-[60vh] grid-cols-2 gap-3 overflow-auto sm:grid-cols-3">
          {canvases.isLoading ? (
            <p className="text-muted-foreground col-span-full py-8 text-center text-sm">
              Loading…
            </p>
          ) : visible.length === 0 ? (
            <p className="text-muted-foreground col-span-full py-8 text-center text-sm">
              {query
                ? "No canvases match."
                : "No canvases yet — create one from the Canvases page."}
            </p>
          ) : (
            visible.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => {
                  onPick(c.id);
                  onOpenChange(false);
                }}
                className="hover:border-foreground/40 overflow-hidden rounded-lg border text-left transition-colors"
              >
                <div className="bg-muted grid aspect-[16/10] place-items-center">
                  {c.thumbnailUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={c.thumbnailUrl}
                      alt=""
                      className="h-full w-full object-contain"
                      loading="lazy"
                    />
                  ) : (
                    <LayoutGrid className="text-muted-foreground size-6" />
                  )}
                </div>
                <div className="px-2 py-1.5">
                  <p className="truncate text-xs font-medium">
                    {c.title || "Untitled canvas"}
                  </p>
                  {c.projectName ? (
                    <p className="text-muted-foreground truncate text-[11px]">
                      in {c.projectName}
                    </p>
                  ) : null}
                </div>
              </button>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
