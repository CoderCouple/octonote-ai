import { unwrapBaseResponse } from "@octonote/api-client";
import { env } from "@/env/client";
import type { CanvasReferenceResolver } from "@/features/notes/blocks/canvas-reference-context";
import type { PublicCanvas, PublicView } from "../types";

/**
 * Canvas references on a published page resolve through the public API, so
 * only canvases inside the same published notebook/project show; others
 * render as unavailable.
 */
export function publicCanvasResolver(slug: string): CanvasReferenceResolver {
  return {
    id: `public:${slug}`,
    resolve: async (canvasId) => {
      const path = `/public/${encodeURIComponent(slug)}/canvas/${encodeURIComponent(canvasId)}`;
      const res = await fetch(`${env.NEXT_PUBLIC_API_URL}${path}`);
      if (!res.ok) return null;
      const view = unwrapBaseResponse<PublicView>(await res.json(), path);
      const canvas = view.resource as PublicCanvas;
      return {
        title: canvas.title,
        thumbnailUrl: canvas.thumbnailUrl,
        href: `/pub/${slug}/canvas/${canvasId}`,
      };
    },
  };
}
