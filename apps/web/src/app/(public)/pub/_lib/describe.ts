import type { Metadata } from "next";
import type { PublicResource } from "@/features/public/types";

/** Title + description + OG image (canvas thumbnail) for link previews. */
export function describe(title: string, resource: PublicResource): Metadata {
  const description =
    resource.kind === "page"
      ? resource.contentMd.replace(/[#*_>`[\]()-]/g, "").trim().slice(0, 160)
      : resource.kind === "project"
        ? (resource.description ?? `A project on Octonote`)
        : resource.kind === "notebook"
          ? `A notebook with ${resource.items.length} item${resource.items.length === 1 ? "" : "s"}`
          : "A canvas on Octonote";
  const image =
    resource.kind === "canvas"
      ? resource.thumbnailUrl
      : resource.kind === "project"
        ? (resource.canvas?.thumbnailUrl ?? null)
        : null;
  const fullTitle = `${title || "Untitled"} · Octonote`;
  return {
    title: fullTitle,
    description,
    openGraph: { title: fullTitle, description, ...(image ? { images: [image] } : {}) },
    twitter: { card: image ? "summary_large_image" : "summary", title: fullTitle, description },
  };
}
