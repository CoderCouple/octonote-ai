import type { Partner } from "@octonote/shared";
import { toast } from "sonner";

/** Copies to the clipboard and says so. */
export function copyText(text: string, what: string) {
  void navigator.clipboard
    .writeText(text)
    .then(() => toast.success(`Copied ${what}.`))
    .catch(() => toast.error("Couldn't copy."));
}

/** "30% · 12 months" */
export const termsOf = (p: Pick<Partner, "commissionPercent" | "commissionMonths">) =>
  `${p.commissionPercent}% · ${p.commissionMonths === null ? "as long as they pay" : `${p.commissionMonths} months`}`;
