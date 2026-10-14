/**
 * Anonymous reads for /pub pages. Never cached: unpublishing must take
 * effect immediately, so a stale cached copy would leak content.
 */
import "server-only";
import { headers } from "next/headers";
import { cache } from "react";
import { unwrapBaseResponse } from "@octonote/api-client";
import { env } from "@/env/client";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { PublicKind, PublicView } from "../types";

/**
 * `countView` is set by the page render and its generateMetadata, which share
 * one request per visit through React's `cache` (so each visit counts once
 * and the API is called once). For the counter we
 * forward the reader's user agent (to skip bots), IP (only hashed with a
 * daily-rotating salt to count unique visitors) and, if they're signed in,
 * their token (to count them by account and skip the item's own editors).
 * The API stores none of these.
 */
async function get(
  path: string,
  countView: boolean,
): Promise<PublicView | null> {
  const init: RequestInit = { cache: "no-store" };
  if (countView) {
    const h = await headers();
    const ip =
      h.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      h.get("x-real-ip") ||
      "";
    const supabase = await createSupabaseServerClient();
    const {
      data: { session },
    } = await supabase.auth.getSession();
    init.headers = {
      "x-octonote-view": "1",
      "x-octonote-ua": h.get("user-agent") ?? "",
      "x-octonote-ip": ip,
      ...(session ? { authorization: `Bearer ${session.access_token}` } : {}),
    };
  }
  const res = await fetch(`${env.NEXT_PUBLIC_API_URL}${path}`, init);
  if (res.status === 404 || res.status === 400) return null;
  if (!res.ok) throw new Error(`Public fetch failed (${res.status})`);
  return unwrapBaseResponse<PublicView>(await res.json(), path);
}

/** One fetch per request for the same path (page + its metadata). */
const getOnce = cache(get);

export function fetchPublishedRoot(slug: string, { countView = false } = {}) {
  return getOnce(`/public/${encodeURIComponent(slug)}`, countView);
}

export function fetchPublishedChild(
  slug: string,
  kind: PublicKind,
  id: string,
  { countView = false } = {},
) {
  return getOnce(
    `/public/${encodeURIComponent(slug)}/${kind}/${encodeURIComponent(id)}`,
    countView,
  );
}
