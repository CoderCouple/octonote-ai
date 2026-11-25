import { notFound } from "next/navigation";
import { EmbeddedDeck } from "@/features/decks/components/embedded-deck";
import { PrintableDeck } from "@/features/decks/components/printable-deck";
import { fetchPublishedChild, fetchPublishedRoot } from "@/features/public/lib/fetch-public";

/** A published deck by slug (the root) or by id inside a published notebook; anything else is 404. */
async function publishedDeck(slug: string, id?: string) {
  const view = id ? await fetchPublishedChild(slug, "deck", id) : await fetchPublishedRoot(slug);
  if (!view || view.resource.kind !== "deck") notFound();
  return { resource: view.resource, href: id ? `/pub/${slug}/deck/${id}` : `/pub/${slug}` };
}

export async function EmbedPage({ slug, id, slide }: { slug: string; id?: string; slide?: string }) {
  const { resource, href } = await publishedDeck(slug, id);
  const start = Math.max(0, (Number.parseInt(slide ?? "1", 10) || 1) - 1);
  return <EmbeddedDeck slug={slug} title={resource.title} document={resource.document} start={start} href={href} />;
}

export async function PublishedPrintPage({ slug, id }: { slug: string; id?: string }) {
  const { resource } = await publishedDeck(slug, id);
  return <PrintableDeck title={resource.title} document={resource.document} slug={slug} />;
}
