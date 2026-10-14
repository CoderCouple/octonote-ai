"use client";

/**
 * "Have a code?" — one box for every kind of code. A free code turns Pro on
 * right away; a discount code is checked and handed to `onDiscount` to be
 * applied at checkout. Refusals show the API's reason (expired, used up…).
 */
import type { PromoApplyResult } from "@octonote/shared";
import { Loader2, Ticket } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { applyCodeClientApi } from "../api";

export function CodeEntry({
  workspaceId,
  onFree,
  onDiscount,
  className,
}: {
  workspaceId: string;
  onFree: (result: Extract<PromoApplyResult, { kind: "free_pro" }>) => void;
  onDiscount: (discount: { code: string; description: string }) => void;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn(
          "text-muted-foreground hover:text-foreground-strong inline-flex items-center gap-1.5 text-sm underline-offset-4 hover:underline",
          className,
        )}
      >
        <Ticket className="size-3.5" />
        Have a code?
      </button>
    );
  }

  async function apply() {
    if (!code.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const result = await applyCodeClientApi(workspaceId, code.trim());
      if (result.kind === "free_pro") {
        toast.success(`Code applied: ${result.description}.`);
        onFree(result);
      } else {
        onDiscount({ code: result.code, description: result.description });
      }
      setCode("");
      setOpen(false);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message.replace(/^Octonote API \S+ \d+(?: \[[A-Z_]+\])?: /, "")
          : "Couldn't apply that code.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      className={cn("flex flex-col gap-1.5", className)}
      onSubmit={(e) => {
        e.preventDefault();
        void apply();
      }}
    >
      <div className="flex items-center gap-2">
        <Input
          autoFocus
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          placeholder="CODE"
          aria-label="Promo code"
          maxLength={40}
          className="font-mono uppercase"
          disabled={busy}
        />
        <Button type="submit" variant="outline" disabled={busy || !code.trim()}>
          {busy ? <Loader2 className="size-4 animate-spin" /> : null}
          Apply
        </Button>
      </div>
      {error ? <p className="text-destructive text-sm">{error}</p> : null}
    </form>
  );
}
