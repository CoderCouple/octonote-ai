import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { JsonLd } from "@/components/json-ld";
import { PublicPage } from "@/features/public";
import { fetchPublishedRoot } from "@/features/public/lib/fetch-public";
import { articleJsonLd, describe } from "../_lib/describe";

type Params = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug } = await params;
  const view = await fetchPublishedRoot(slug, { countView: true });
  if (!view) return { title: "Not found · Octonote AI" };
  return describe(view, `/pub/${slug}`);
}

export default async function PublishedRootPage({ params }: Params) {
  const { slug } = await params;
  const view = await fetchPublishedRoot(slug, { countView: true });
  if (!view) notFound();
  return (
    <>
      <JsonLd data={articleJsonLd(view, `/pub/${slug}`)} />
      <PublicPage view={view} />
    </>
  );
}
