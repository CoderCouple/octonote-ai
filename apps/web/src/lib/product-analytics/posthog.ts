"use client";

/**
 * Product analytics in the browser (PostHog, US cloud), with privacy first:
 *   - memory-only: no cookies or local storage, so no cookie banner;
 *   - no autocapture, no heatmaps, no surveys: only page views and a few
 *     named events (see `track`);
 *   - replays only in the signed-in app, with every piece of text and every
 *     input masked, and the note editor and canvas left out entirely;
 *   - never on published pages, the mobile/admin handoffs or the admin portal;
 *   - off without NEXT_PUBLIC_POSTHOG_KEY, and off for people who turn off
 *     "Help improve Octonote";
 *   - off for staff, and on any browser a staff account has used (one flag
 *     in local storage, set only there), so our own visits don't count.
 * Events go through /ingest on our own domain (see next.config.ts).
 */
import posthog from "posthog-js";
import { env } from "@/env/client";

/** Pages that are never tracked, even when reached by an in-app link. */
const UNTRACKED = /^\/(pub|embed|admin|admin-enter)(\/|$)/;

let started = false;

const STAFF_KEY = "octonote:staff";

function isStaffBrowser(): boolean {
  try {
    return window.localStorage.getItem(STAFF_KEY) === "1";
  } catch {
    return false;
  }
}

/** A staff account signed in here: never track this browser again, and stop now. */
export function markStaffBrowser(): void {
  try {
    window.localStorage.setItem(STAFF_KEY, "1");
  } catch {
    // Storage blocked: the app still skips tracking for staff while signed in.
  }
  if (started) {
    posthog.stopSessionRecording();
    posthog.opt_out_capturing();
  }
}

function start(): boolean {
  if (!env.NEXT_PUBLIC_POSTHOG_KEY || typeof window === "undefined") return false;
  if (window.location.host.startsWith("admin.")) return false;
  if (isStaffBrowser()) return false;
  if (started) return true;
  started = true;
  posthog.init(env.NEXT_PUBLIC_POSTHOG_KEY, {
    api_host: "/ingest",
    ui_host: "https://us.posthog.com",
    persistence: "memory",
    person_profiles: "identified_only",
    respect_dnt: true,
    autocapture: false,
    rageclick: false,
    capture_dead_clicks: false,
    capture_heatmaps: false,
    capture_exceptions: false,
    capture_performance: false,
    disable_surveys: true,
    advanced_disable_flags: true,
    capture_pageview: "history_change",
    capture_pageleave: false,
    mask_all_text: true,
    mask_all_element_attributes: true,
    disable_session_recording: true,
    session_recording: {
      maskAllInputs: true,
      maskTextSelector: "*",
      // The editor and canvas (and anything else marked ph-no-capture) are left out of replays.
      blockSelector: ".ph-no-capture",
    },
    before_send: (event) => {
      if (!event) return null;
      const props = event.properties ?? {};
      if (typeof props.$pathname === "string" && UNTRACKED.test(props.$pathname)) return null;
      // Page titles carry note and canvas names; query strings and fragments can carry ids or tokens.
      delete props.title;
      delete props.$title;
      for (const key of ["$current_url", "$referrer", "$initial_current_url"]) {
        if (typeof props[key] === "string") props[key] = stripUrl(props[key] as string);
      }
      return event;
    },
  });
  return true;
}

function stripUrl(url: string): string {
  try {
    const u = new URL(url);
    return `${u.origin}${u.pathname}`;
  } catch {
    return url.split(/[?#]/)[0] ?? url;
  }
}

/** Marketing and sign-in pages: anonymous page views only, no replays. */
export function startSiteAnalytics(): void {
  start();
}

/** The signed-in app: identified by user id only (no name or email), masked replays. */
export function startAppAnalytics(userId: string, allowed: boolean): void {
  if (!start()) return;
  if (!allowed) {
    stopAppAnalytics();
    posthog.opt_out_capturing();
    return;
  }
  if (posthog.has_opted_out_capturing()) posthog.opt_in_capturing({ captureEventName: false });
  if (posthog.get_distinct_id() !== userId) posthog.identify(userId);
  posthog.startSessionRecording();
}

/** Leaving the app (or turning analytics off): stop the replay. */
export function stopAppAnalytics(): void {
  if (started) posthog.stopSessionRecording();
}

/** Applies the "Help improve Octonote" switch straight away. */
export function setAnalyticsAllowed(userId: string, allowed: boolean): void {
  if (!started) return;
  if (allowed) startAppAnalytics(userId, true);
  else {
    stopAppAnalytics();
    posthog.opt_out_capturing();
  }
}

export type ClientEvent = "signup_clicked" | "demo_clicked" | "upgrade_prompt_shown";

/** A named event; never pass anything people wrote. */
export function track(event: ClientEvent, properties: Record<string, string | number | boolean | null> = {}): void {
  if (started && !posthog.has_opted_out_capturing()) posthog.capture(event, properties);
}
