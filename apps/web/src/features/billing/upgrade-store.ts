"use client";

/**
 * Opens the upgrade dialog from anywhere: a create that hit the free limit,
 * the once-a-day nudge, or an Upgrade button.
 */
import { ApiError } from "@octonote/api-client";
import { PLAN_LIMIT_CODE, type LimitedKind } from "@octonote/shared";
import { create } from "zustand";
import { track } from "@/lib/product-analytics/posthog";

export type UpgradeReason = LimitedKind | "workspace" | null;

interface UpgradeState {
  open: boolean;
  /** What ran out, for the headline; null for a plain "Upgrade". */
  reason: UpgradeReason;
  workspaceId: string | null;
  /** A discount code checked in Plan & billing, applied at checkout. */
  discount: { code: string; description: string } | null;
  show: (
    reason?: UpgradeReason,
    discount?: { code: string; description: string } | null,
  ) => void;
  hide: () => void;
  setWorkspace: (id: string) => void;
}

export const useUpgrade = create<UpgradeState>((set) => ({
  open: false,
  reason: null,
  workspaceId: null,
  discount: null,
  show: (reason = null, discount = null) => {
    track("upgrade_prompt_shown", { reason: reason ?? "button" });
    set({ open: true, reason, discount });
  },
  hide: () => set({ open: false }),
  setWorkspace: (workspaceId) => set({ workspaceId }),
}));

/** If `err` is a free-plan limit, opens the upgrade dialog and returns true. */
export function handlePlanLimit(err: unknown): boolean {
  if (!(err instanceof ApiError) || err.code !== PLAN_LIMIT_CODE) return false;
  const kind = err.extra.kind as UpgradeReason;
  const workspaceId = err.extra.workspaceId;
  if (typeof workspaceId === "string")
    useUpgrade.getState().setWorkspace(workspaceId);
  useUpgrade.getState().show(kind ?? null);
  return true;
}
