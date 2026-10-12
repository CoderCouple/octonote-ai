/**
 * Free-limit prompts on mobile. Payment happens on the web (no in-app
 * purchase), so "See plans" opens the web app's Plan & billing page.
 *
 * Before an App Store / Play Store release, re-check the storefront rules on
 * linking out to web payment; outside the US this may need to become plain
 * text without a link.
 */
import { ApiError } from "@octonote/api-client";
import {
  FREE_LIMIT,
  kindsAtLimit,
  PLAN_LIMIT_CODE,
  type BillingSummary,
  type LimitedKind,
} from "@octonote/shared";
import * as SecureStore from "expo-secure-store";
import * as WebBrowser from "expo-web-browser";
import { Alert } from "react-native";
import { env } from "./env";

const NOUN: Record<LimitedKind, string> = {
  page: "notes",
  canvas: "canvases",
  project: "projects",
  notebook: "notebooks",
};

export function openPlans() {
  void WebBrowser.openBrowserAsync(`${env.WEB_URL}/workspace/settings#billing`);
}

export function promptUpgrade(kind: LimitedKind | "workspace" | null) {
  const title =
    kind === "workspace"
      ? "The Free plan includes one workspace"
      : kind
        ? `You've used your ${FREE_LIMIT} free ${NOUN[kind]}`
        : "Upgrade to Pro";
  Alert.alert(
    title,
    "Upgrade to Pro for unlimited notes, canvases, projects, notebooks and workspaces.",
    [
      { text: "Not now", style: "cancel" },
      { text: "See plans", onPress: openPlans },
    ],
  );
}

/** If `err` is a free-plan limit, shows the upgrade prompt and returns true. */
export function handlePlanLimit(err: unknown): boolean {
  if (!(err instanceof ApiError) || err.code !== PLAN_LIMIT_CODE) return false;
  promptUpgrade(
    (err.extra.kind as LimitedKind | "workspace" | undefined) ?? null,
  );
  return true;
}

/** Once any kind is at its limit, prompt — at most once a day per workspace. */
export async function nudgeIfAtLimit(
  workspaceId: string,
  summary: BillingSummary,
) {
  if (!summary.billingEnabled) return;
  const full = kindsAtLimit(summary);
  if (full.length === 0) return;
  const key = `upgrade-nudge-${workspaceId.replace(/[^A-Za-z0-9._-]/g, "")}`;
  const today = new Date().toISOString().slice(0, 10);
  try {
    if ((await SecureStore.getItemAsync(key)) === today) return;
    await SecureStore.setItemAsync(key, today);
  } catch {
    // Storage unavailable: nudge anyway.
  }
  promptUpgrade(full[0]!);
}
