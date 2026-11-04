import { getCanvasSummaryClientApi } from "@/features/canvas";
import { getFigureWithPicture } from "@/features/canvas/lib/figure-picture";
import type { CanvasReferenceResolver } from "./canvas-reference-context";

/** In-app: the permission-checked summary endpoint; project canvases open inside their project. */
export const appCanvasResolver: CanvasReferenceResolver = {
  id: "app",
  resolve: async (canvasId) => {
    try {
      const c = await getCanvasSummaryClientApi(canvasId);
      return {
        title: c.title,
        thumbnailUrl: c.thumbnailUrl,
        href: c.projectId ? `/p/${c.projectId}?view=canvas` : `/c/${c.id}`,
      };
    } catch {
      return null;
    }
  },
  resolveFigure: async (figureId) => {
    try {
      const f = await getFigureWithPicture(figureId);
      return {
        title: f.title,
        imageUrl: f.imageUrl,
        width: f.width,
        height: f.height,
        href: f.canvasHref,
      };
    } catch {
      return null;
    }
  },
};
