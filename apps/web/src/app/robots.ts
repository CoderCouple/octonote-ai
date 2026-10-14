import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";

/**
 * Marketing pages and published pages (/pub) are crawlable; the app is not.
 * /login and /signup stay crawlable so Google can read their noindex tag.
 * Previews and other hosts get `X-Robots-Tag: noindex` from the middleware.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: [
        "/workspace",
        "/n/",
        "/c/",
        "/p/",
        "/nb/",
        "/embed/",
        "/auth/",
        "/cli/connect",
      ],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
