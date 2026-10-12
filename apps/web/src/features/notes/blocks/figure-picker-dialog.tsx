"use client";

import { useQuery } from "@tanstack/react-query";
import { Group } from "lucide-react";
import { useMemo, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  listWorkspaceFiguresClientApi,
  type FigureSummary,
} from "@/features/canvas";

/** "/figure": pick any figure from the workspace's canvases to embed as an image. */
export function FigurePickerDialog({
  open,
  onOpenChange,
  workspaceId,
  onPick,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workspaceId: string;
  onPick: (figure: FigureSummary) => void;
}) {
  const [query, setQuery] = useState("");
  const figures = useQuery({
    queryKey: ["figures", workspaceId],
    queryFn: () => listWorkspaceFiguresClientApi(workspaceId),
    enabled: open,
  });

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    const rows = figures.data ?? [];
    if (!q) return rows;
    return rows.filter(
      (f) =>
        f.title.toLowerCase().includes(q) ||
        f.canvasTitle?.toLowerCase().includes(q),
    );
  }, [figures.data, query]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Insert a figure</DialogTitle>
          <DialogDescription>
            Figures are groups of shapes on a canvas. The picture in your note
            updates when the figure changes.
          </DialogDescription>
        </DialogHeader>
        <Input
          autoFocus
          placeholder="Search figures"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Search figures"
        />
        <div className="grid max-h-[60vh] grid-cols-2 gap-3 overflow-auto sm:grid-cols-3">
          {figures.isLoading ? (
            <p className="text-muted-foreground col-span-full py-8 text-center text-sm">
              Loading…
            </p>
          ) : visible.length === 0 ? (
            <p className="text-muted-foreground col-span-full py-8 text-center text-sm">
              {query
                ? "No figures match."
                : "No figures yet — on a canvas, select some shapes and press the Figure button."}
            </p>
          ) : (
            visible.map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => {
                  onPick(f);
                  onOpenChange(false);
                }}
                className="hover:border-foreground/40 overflow-hidden rounded-lg border text-left transition-colors"
              >
                <div className="grid aspect-[16/10] place-items-center bg-white p-1.5">
                  {f.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={f.imageUrl}
                      alt=""
                      className="h-full w-full object-contain"
                      loading="lazy"
                    />
                  ) : (
                    <Group className="text-muted-foreground size-6" />
                  )}
                </div>
                <div className="px-2 py-1.5">
                  <p className="truncate text-xs font-medium">
                    {f.title || "Figure"}
                  </p>
                  {f.canvasTitle ? (
                    <p className="text-muted-foreground truncate text-2xs">
                      on {f.canvasTitle}
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
