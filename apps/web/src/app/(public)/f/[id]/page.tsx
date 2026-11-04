import type { Metadata } from "next";
import { NoAccess } from "@/app/(focus)/_components/no-access";
import type { FigureView } from "@/features/canvas/api/figures-client-api";
import { FigurePage } from "@/features/public/components/figure-page";
import { loadOrGate } from "@/lib/load-or-gate";
import { serverFetch } from "@/lib/api/server-fetch";

type Props = { params: Promise<{ id: string }> };

const load = (id: string) => serverFetch<FigureView>(`/figures/${encodeURIComponent(id)}`);

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const figure = await load(id).catch(() => null);
  if (!figure) return { title: "Figure", robots: { index: false } };
  return {
    title: figure.title,
    robots: { index: false },
    // Link previews have no sign-in, so only a public figure gets a picture.
    ...(figure.public && figure.imageUrl ? { openGraph: { title: figure.title, images: [figure.imageUrl] } } : {}),
  };
}

export default async function FigureRoute({ params }: Props) {
  const { id } = await params;
  const res = await loadOrGate(() => load(id), `/f/${id}`);
  if (!res.ok) return <NoAccess />;
  return <FigurePage figure={res.data} />;
}
