import type { Metadata } from "next";
import { EmbedPage } from "../../_deck-pages";

export const metadata: Metadata = { robots: { index: false } };

/** `/embed/<slug>?slide=3`: a published presentation for an iframe. */
export default async function Page({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ slide?: string }> }) {
  const { slug } = await params;
  return <EmbedPage slug={slug} slide={(await searchParams).slide} />;
}
