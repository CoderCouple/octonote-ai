"use client";

import { AlertCircle, Check, Loader2 } from "lucide-react";

export type SaveState = "idle" | "saving" | "saved" | "error";

export function SaveIndicator({ state }: { state: SaveState }) {
  if (state === "idle") return null;
  if (state === "error") {
    return (
      <span className="text-destructive flex items-center gap-1 text-xs" role="status">
        <AlertCircle className="size-3.5" />
        Not saved — retrying on next change
      </span>
    );
  }
  return (
    <span className="text-muted-foreground flex items-center gap-1 text-xs" role="status">
      {state === "saving" ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5" />}
      {state === "saving" ? "Saving…" : "Saved"}
    </span>
  );
}
