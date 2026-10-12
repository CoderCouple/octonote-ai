"use client";

/**
 * Once any kind reaches its free limit (whichever comes first), show the
 * upgrade dialog — at most once a day per workspace, so it nudges without
 * nagging. Also remembers the active workspace for the dialog.
 */
import { kindsAtLimit } from "@octonote/shared";
import { useEffect } from "react";
import { getBillingClientApi } from "../api";
import { useUpgrade } from "../upgrade-store";

const key = (workspaceId: string) => `octonote:upgrade-nudge:${workspaceId}`;

export function UpgradeNudge({ workspaceId }: { workspaceId: string }) {
  useEffect(() => {
    useUpgrade.getState().setWorkspace(workspaceId);
    let live = true;
    getBillingClientApi(workspaceId)
      .then((summary) => {
        if (!live || !summary.billingEnabled) return;
        const full = kindsAtLimit(summary);
        if (full.length === 0) return;
        const today = new Date().toISOString().slice(0, 10);
        try {
          if (localStorage.getItem(key(workspaceId)) === today) return;
          localStorage.setItem(key(workspaceId), today);
        } catch {
          // No storage (private mode): still nudge, just not remembered.
        }
        useUpgrade.getState().show(full[0]!);
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [workspaceId]);
  return null;
}
