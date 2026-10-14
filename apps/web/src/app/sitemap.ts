import type { MetadataRoute } from "next";
import {
  EXAMPLES,
  EXAMPLES_NOTEBOOK_SLUG,
} from "@/app/(marketing)/_data/examples";
import { fetchPublishedRoot } from "@/features/public/lib/fetch-public";
import { SITE_URL } from "@/lib/site";

/**
 * Marketing pages plus the official examples only (SEO decision 2026-10-13):
 * pages users publish are reachable by link but never listed here.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const pages: MetadataRoute.Sitemap = [
    { url: SITE_URL, changeFrequency: "weekly", priority: 1 },
    { url: `${SITE_URL}/cli`, changeFrequency: "weekly", priority: 0.8 },
    { url: `${SITE_URL}/privacy`, changeFrequency: "yearly", priority: 0.2 },
    { url: `${SITE_URL}/terms`, changeFrequency: "yearly", priority: 0.2 },
  ];

  const slugs = [EXAMPLES_NOTEBOOK_SLUG, ...EXAMPLES.map((e) => e.slug)];
  const examples = await Promise.all(
    slugs.map(async (slug) => {
      // A missing or unpublished example is left out rather than listed as a 404.
      const view = await fetchPublishedRoot(slug).catch(() => null);
      if (!view) return null;
      return {
        url: `${SITE_URL}/pub/${slug}`,
        lastModified: new Date(view.resource.updatedAt),
        changeFrequency: "monthly" as const,
        priority: slug === EXAMPLES_NOTEBOOK_SLUG ? 0.7 : 0.6,
      };
    }),
  );
  return [...pages, ...examples.filter((e) => e !== null)];
}
