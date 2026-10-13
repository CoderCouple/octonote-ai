import type { PublicKind } from "@/features/public/types";
import { fetchPublishedChild } from "@/features/public/lib/fetch-public";
import { OG_CONTENT_TYPE, OG_SIZE, ogCard } from "../../../_lib/og-card";

export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;
export const alt = "A page published on Octonote AI";

const KINDS = new Set<PublicKind>(["page", "canvas", "project", "notebook"]);

export default async function Image({
  params,
}: {
  params: Promise<{ slug: string; kind: string; id: string }>;
}) {
  const { slug, kind, id } = await params;
  if (!KINDS.has(kind as PublicKind)) return ogCard(null);
  return ogCard(await fetchPublishedChild(slug, kind as PublicKind, id));
}
