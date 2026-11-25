import type { Metadata } from "next";
import { PrintableDeck } from "@/features/decks/components/printable-deck";
import { getDeckApi } from "@/features/decks/api/decks-api";
import { loadOrGate } from "@/lib/load-or-gate";
import { NoAccess } from "@/app/(focus)/_components/no-access";

export const metadata: Metadata = { title: "Print presentation", robots: { index: false } };

/** In-app PDF: anyone who can open the deck; `?notes=1` adds the presenter notes under each slide. */
export default async function Page({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ notes?: string }> }) {
  const { id } = await params;
  const res = await loadOrGate(() => getDeckApi(id), `/print/d/${id}`);
  if (!res.ok) return <NoAccess />;
  return <PrintableDeck title={res.data.title} document={res.data.document} notes={(await searchParams).notes === "1"} />;
}
