"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

/**
 * Replaces the platform `window.confirm()` for destructive actions —
 * a styled modal that optionally requires the user to type a
 * verification string before the destructive button enables.
 *
 * Pass `typeToConfirm` when the action is dangerous enough that the
 * user should pause and re-read what they're about to do (deleting a
 * project, dropping a canvas, etc.). Omit it for lighter
 * "are you sure?" prompts.
 */
interface ConfirmActionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  /**
   * The button label for the destructive action. Defaults to
   * "Delete". `destructive: false` swaps the variant to primary.
   */
  actionLabel?: string;
  /** When false, the confirm button uses the primary variant instead of destructive. */
  destructive?: boolean;
  /**
   * When set, the user must type `value` exactly to enable the
   * action button. `label` defaults to "name" if not provided.
   */
  typeToConfirm?: {
    value: string;
    label?: string;
  };
  onConfirm: () => void | Promise<void>;
}

export function ConfirmActionDialog({
  open,
  onOpenChange,
  title,
  description,
  actionLabel = "Delete",
  destructive = true,
  typeToConfirm,
  onConfirm,
}: ConfirmActionDialogProps) {
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);

  // Reset the typed input + busy flag whenever the dialog opens or
  // closes. Prevents stale state from leaking between invocations of
  // the same dialog instance.
  useEffect(() => {
    if (!open) {
      setTyped("");
      setBusy(false);
    }
  }, [open]);

  const matches = !typeToConfirm || typed === typeToConfirm.value;
  const canConfirm = matches && !busy;

  const handleConfirm = async () => {
    if (!canConfirm) return;
    setBusy(true);
    try {
      await onConfirm();
      onOpenChange(false);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        {typeToConfirm ? (
          <div className="space-y-2">
            <label className="text-foreground text-sm">
              Type{" "}
              <span className="bg-muted rounded px-1.5 py-0.5 font-mono text-[12px] font-semibold">
                {typeToConfirm.value}
              </span>{" "}
              to confirm
            </label>
            <Input
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              autoFocus
              autoComplete="off"
              spellCheck={false}
              placeholder={typeToConfirm.label ?? "name"}
              onKeyDown={(e) => {
                if (e.key === "Enter" && canConfirm) {
                  e.preventDefault();
                  void handleConfirm();
                }
              }}
            />
          </div>
        ) : null}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancel
          </Button>
          <Button
            variant={destructive ? "destructive" : "default"}
            disabled={!canConfirm}
            onClick={() => void handleConfirm()}
          >
            {busy ? "Working…" : actionLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
