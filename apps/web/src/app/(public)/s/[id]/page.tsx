import type { StudioItem } from "@octonote/shared";
import type { Metadata } from "next";
import { NoAccess } from "@/app/(focus)/_components/no-access";
import { SharedStudioItem } from "@/features/studio/shared-item";
import { serverFetch } from "@/lib/api/server-fetch";
import { loadOrGate } from "@/lib/load-or-gate";

type Props = { params: Promise<{ id: string }> };

const load = (id: string) => serverFetch<StudioItem>(`/studio/${encodeURIComponent(id)}`);

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const item = await load(id).catch(() => null);
  if (!item) return { title: "Studio", robots: { index: false } };
  return { title: item.title, robots: { index: false }, openGraph: { title: item.title } };
}

/** A studio item shared by link: anyone can view and use it; the source text stays private. */
export default async function SharedStudioRoute({ params }: Props) {
  const { id } = await params;
  const res = await loadOrGate(() => load(id), `/s/${id}`);
  if (!res.ok || res.data.status !== "succeeded" || !res.data.spec) return <NoAccess />;
  return <SharedStudioItem item={res.data} />;
}
