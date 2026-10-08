/**
 * Anonymous reads for /pub pages. Never cached: unpublishing must take
 * effect immediately, so a stale cached copy would leak content.
 */
import "server-only";
import { unwrapBaseResponse } from "@octonote/api-client";
import { env } from "@/env/client";
import type { PublicKind, PublicView } from "../types";

async function get(path: string): Promise<PublicView | null> {
  const res = await fetch(`${env.NEXT_PUBLIC_API_URL}${path}`, { cache: "no-store" });
  if (res.status === 404 || res.status === 400) return null;
  if (!res.ok) throw new Error(`Public fetch failed (${res.status})`);
  return unwrapBaseResponse<PublicView>(await res.json(), path);
}

export function fetchPublishedRoot(slug: string) {
  return get(`/public/${encodeURIComponent(slug)}`);
}

export function fetchPublishedChild(slug: string, kind: PublicKind, id: string) {
  return get(`/public/${encodeURIComponent(slug)}/${kind}/${encodeURIComponent(id)}`);
}
