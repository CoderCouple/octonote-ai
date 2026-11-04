import type { CanvasDocument } from "@octonote/octodraw";
import { describe, expect, it, vi } from "vitest";
import { thumbnailIsStale } from "../constants";

vi.mock("./render", () => ({}));
vi.mock("@/lib/supabase/browser", () => ({}));
vi.mock("../api/canvases-client-api", () => ({}));

const { firstFigure } = await import("./thumbnail");

const figure = (id: string, x: number, y: number, source = "A > B") => ({ id, type: "figure", x, y, w: 100, h: 100, source });
const doc = (...items: unknown[]) => ({ version: 1, items }) as unknown as CanvasDocument;

describe("a project's picture", () => {
  it("is the first figure in reading order: top row, then leftmost", () => {
    expect(firstFigure(doc(figure("low", 0, 900), figure("right", 500, 20), figure("left", 0, 60)))?.id).toBe("left");
  });
  it("skips empty figures and other items", () => {
    expect(firstFigure(doc({ id: "s", type: "shape", x: 0, y: 0 }, figure("empty", 0, 0, " "), figure("real", 0, 500)))?.id).toBe("real");
  });
  it("is nothing without a figure, so the whole canvas is used", () => {
    expect(firstFigure(doc({ id: "s", type: "shape", x: 0, y: 0 }))).toBeNull();
  });
});

describe("which thumbnails get redrawn", () => {
  it("missing, old-style and figure links; not current ones", () => {
    expect(thumbnailIsStale(null)).toBe(true);
    expect(thumbnailIsStale("https://x.co/canvas-thumbnails/cnv_1/abc.png")).toBe(true);
    expect(thumbnailIsStale("https://octonote.ai/f/fig_1.png?v=1")).toBe(true);
    expect(thumbnailIsStale("https://x.co/canvas-thumbnails/cnv_1/v2-abc.png")).toBe(false);
  });
});
