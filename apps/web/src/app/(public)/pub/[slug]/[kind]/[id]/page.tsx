import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PublicPage, publicTitle, type PublicKind } from "@/features/public";
import { fetchPublishedChild } from "@/features/public/lib/fetch-public";
import { describe } from "../../../_lib/describe";

const KINDS = new Set<PublicKind>(["page", "canvas", "project", "notebook"]);
type Params = { params: Promise<{ slug: string; kind: string; id: string }> };

async function load({ params }: Params) {
  const { slug, kind, id } = await params;
  if (!KINDS.has(kind as PublicKind)) return null;
  return fetchPublishedChild(slug, kind as PublicKind, id);
}

export async function generateMetadata(props: Params): Promise<Metadata> {
  const view = await load(props);
  if (!view) return { title: "Not found · Octonote AI" };
  return describe(publicTitle(view.resource), view.resource);
}

export default async function PublishedChildPage(props: Params) {
  const view = await load(props);
  if (!view) notFound();
  return <PublicPage view={view} />;
}
