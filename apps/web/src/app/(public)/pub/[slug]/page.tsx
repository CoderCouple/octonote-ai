import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PublicPage, publicTitle } from "@/features/public";
import { fetchPublishedRoot } from "@/features/public/lib/fetch-public";
import { describe } from "../_lib/describe";

type Params = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug } = await params;
  const view = await fetchPublishedRoot(slug);
  if (!view) return { title: "Not found · Octonote AI" };
  return describe(publicTitle(view.resource), view.resource);
}

export default async function PublishedRootPage({ params }: Params) {
  const { slug } = await params;
  const view = await fetchPublishedRoot(slug);
  if (!view) notFound();
  return <PublicPage view={view} />;
}
