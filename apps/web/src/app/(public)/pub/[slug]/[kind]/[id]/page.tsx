import type { Metadata } from "next";
import { notFound } from "next/navigation";
import {
  PublicPage,
  type NotebookContext,
  type PublicKind,
  type PublicView,
} from "@/features/public";
import {
  fetchPublishedChild,
  fetchPublishedRoot,
} from "@/features/public/lib/fetch-public";
import { JsonLd } from "@/components/json-ld";
import { articleJsonLd, describe } from "../../../_lib/describe";

const KINDS = new Set<PublicKind>(["page", "canvas", "project", "notebook"]);
type Params = { params: Promise<{ slug: string; kind: string; id: string }> };

async function pathOf({ params }: Params) {
  const { slug, kind, id } = await params;
  return `/pub/${slug}/${kind}/${id}`;
}

async function load({ params }: Params, countView = false) {
  const { slug, kind, id } = await params;
  if (!KINDS.has(kind as PublicKind)) return null;
  return fetchPublishedChild(slug, kind as PublicKind, id, { countView });
}

export async function generateMetadata(props: Params): Promise<Metadata> {
  const view = await load(props);
  if (!view) return { title: "Not found · Octonote AI" };
  return describe(view, await pathOf(props));
}

export default async function PublishedChildPage(props: Params) {
  const view = await load(props, true);
  if (!view) notFound();
  return (
    <>
      <JsonLd data={articleJsonLd(view, await pathOf(props))} />
      <PublicPage view={view} notebook={await notebookFor(view)} />
    </>
  );
}

/**
 * Opened from inside a published notebook: load the notebook too, for the
 * left rail (desktop) and the notebook sheet (phones).
 */
async function notebookFor(view: PublicView): Promise<NotebookContext | null> {
  if (view.root.kind !== "notebook") return null;
  const root = await fetchPublishedRoot(view.root.slug);
  if (!root || root.resource.kind !== "notebook") return null;
  return {
    slug: view.root.slug,
    name: root.resource.name,
    items: root.resource.items.map(({ kind, id, title }) => ({
      kind,
      id,
      title,
    })),
    current: { kind: view.resource.kind, id: view.resource.id },
  };
}
