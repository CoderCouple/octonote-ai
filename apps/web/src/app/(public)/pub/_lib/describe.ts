import type { Metadata } from "next";
import type { PublicResource } from "@/features/public/types";

/** Title + description for link previews; the image is each route's opengraph-image. */
export function describe(title: string, resource: PublicResource): Metadata {
  const description =
    resource.kind === "page"
      ? resource.contentMd
          .replace(/[#*_>`[\]()-]/g, "")
          .trim()
          .slice(0, 160)
      : resource.kind === "project"
        ? (resource.description ?? `A project on Octonote AI`)
        : resource.kind === "notebook"
          ? `A notebook with ${resource.items.length} item${resource.items.length === 1 ? "" : "s"}`
          : "A canvas on Octonote AI";
  const fullTitle = `${title || "Untitled"} · Octonote AI`;
  return {
    title: fullTitle,
    description,
    openGraph: {
      title: fullTitle,
      description,
    },
    twitter: {
      card: "summary_large_image",
      title: fullTitle,
      description,
    },
  };
}
