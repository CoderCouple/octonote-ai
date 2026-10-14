import type { Metadata } from "next";
import type { PublicView } from "@/features/public/types";
import { publicTitle } from "@/features/public/types";
import { SITE_NAME, SITE_URL } from "@/lib/site";

function descriptionOf(view: PublicView): string {
  const r = view.resource;
  if (r.kind === "page")
    return r.contentMd
      .replace(/[#*_>`[\]()-]/g, "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 160);
  if (r.kind === "project")
    return r.description ?? `A note and canvas, side by side, on ${SITE_NAME}`;
  if (r.kind === "notebook")
    return `A notebook with ${r.items.length} item${r.items.length === 1 ? "" : "s"}, published on ${SITE_NAME}`;
  return `A canvas published on ${SITE_NAME}`;
}

/**
 * Title, description, canonical URL and article details for a published
 * page; `path` is the page's own path (/pub/<slug> or a notebook child).
 * The image is each route's opengraph-image.
 */
export function describe(view: PublicView, path: string): Metadata {
  const description = descriptionOf(view);
  const fullTitle = `${publicTitle(view.resource) || "Untitled"} · ${SITE_NAME}`;
  const author = view.byline.author?.name ?? undefined;
  return {
    title: { absolute: fullTitle },
    description,
    authors: author ? [{ name: author }] : undefined,
    alternates: { canonical: path },
    openGraph: {
      type: "article",
      url: path,
      siteName: SITE_NAME,
      title: fullTitle,
      description,
      publishedTime: view.byline.publishedAt ?? undefined,
      modifiedTime: view.resource.updatedAt,
      authors: author ? [author] : undefined,
    },
    twitter: {
      card: "summary_large_image",
      title: fullTitle,
      description,
    },
  };
}

/** schema.org Article for a published page (no emails or ids, like the byline). */
export function articleJsonLd(view: PublicView, path: string) {
  const author = view.byline.author?.name;
  return {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: (publicTitle(view.resource) || "Untitled").slice(0, 110),
    description: descriptionOf(view),
    url: `${SITE_URL}${path}`,
    image: `${SITE_URL}${path}/opengraph-image`,
    datePublished: view.byline.publishedAt ?? undefined,
    dateModified: view.resource.updatedAt,
    author: author ? { "@type": "Person", name: author } : undefined,
    publisher: {
      "@type": "Organization",
      name: SITE_NAME,
      url: SITE_URL,
      logo: `${SITE_URL}/icon.svg`,
    },
  };
}
