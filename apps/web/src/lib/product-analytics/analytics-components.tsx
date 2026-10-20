"use client";

import { useEffect } from "react";
import { startAppAnalytics, startSiteAnalytics, stopAppAnalytics, track } from "./posthog";

/** Marketing and sign-in pages: page views, plus clicks on sign-up links. */
export function SiteAnalytics() {
  useEffect(() => {
    startSiteAnalytics();
    const onClick = (e: MouseEvent) => {
      const link = (e.target as Element | null)?.closest?.("a[href]");
      const href = link?.getAttribute("href") ?? "";
      if (href.startsWith("/signup")) track("signup_clicked", { from: window.location.pathname });
      else if (link?.hasAttribute("data-demo")) track("demo_clicked", { from: window.location.pathname });
    };
    document.addEventListener("click", onClick, { capture: true });
    return () => document.removeEventListener("click", onClick, { capture: true });
  }, []);
  return null;
}

/** The signed-in app (workspace and editors). */
export function AppAnalytics({ userId, allowed }: { userId: string; allowed: boolean }) {
  useEffect(() => {
    startAppAnalytics(userId, allowed);
    return () => stopAppAnalytics();
  }, [userId, allowed]);
  return null;
}
