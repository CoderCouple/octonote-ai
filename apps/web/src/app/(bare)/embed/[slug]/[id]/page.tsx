import type { Metadata } from "next";
import { EmbedPage } from "../../../_deck-pages";

export const metadata: Metadata = { robots: { index: false } };

/** A presentation inside a published notebook, for an iframe. */
export default async function Page({ params, searchParams }: { params: Promise<{ slug: string; id: string }>; searchParams: Promise<{ slide?: string }> }) {
  const { slug, id } = await params;
  return <EmbedPage slug={slug} id={id} slide={(await searchParams).slide} />;
}
