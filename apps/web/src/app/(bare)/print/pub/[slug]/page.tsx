import type { Metadata } from "next";
import { PublishedPrintPage } from "../../../_deck-pages";

export const metadata: Metadata = { robots: { index: false } };

export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  return <PublishedPrintPage slug={(await params).slug} />;
}
