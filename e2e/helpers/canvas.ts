/**
 * Page object for the octodraw canvas inside Octonote (`.occ-root`).
 * Coordinates: `at(x, y)` are offsets inside the canvas root; `screenOf`
 * converts world coordinates using the camera on `.occ-world`.
 */
import { expect, type Locator, type Page } from "@playwright/test";
import type { Api, Canvas, CanvasDoc } from "./api";

export type ToolLabel =
  | "Select" | "Pan" | "Rectangle" | "Ellipse" | "Diamond" | "Sticky note"
  | "Arrow" | "Line" | "Pen" | "Text" | "Comment";

export class CanvasUi {
  readonly root: Locator;
  constructor(
    readonly page: Page,
    scope?: Locator,
  ) {
    this.root = (scope ?? page.locator("body")).locator(".occ-root").first();
  }

  async ready(opts: { items?: number } = {}): Promise<this> {
    await expect(this.root).toBeVisible({ timeout: 60_000 });
    if (opts.items !== undefined) await expect(this.items()).toHaveCount(opts.items);
    return this;
  }

  rail(): Locator {
    return this.root.locator(".occ-rail");
  }
  items(): Locator {
    return this.root.locator(".occ-world [data-item-id]");
  }
  item(id: string): Locator {
    return this.root.locator(`.occ-world [data-item-id="${id}"]`);
  }
  selbar(): Locator {
    return this.root.locator(".occ-selbar");
  }

  async tool(label: ToolLabel): Promise<void> {
    await this.rail().getByRole("button", { name: label, exact: true }).click();
    await expect(this.rail().getByRole("button", { name: label, exact: true })).toHaveAttribute("aria-pressed", "true");
  }

  async rootBox() {
    const b = await this.root.boundingBox();
    if (!b) throw new Error("canvas root not visible");
    return b;
  }

  /** A point inside the canvas, in page coordinates. */
  async at(x: number, y: number): Promise<{ x: number; y: number }> {
    const b = await this.rootBox();
    return { x: b.x + x, y: b.y + y };
  }

  async camera(): Promise<{ x: number; y: number; k: number }> {
    const t = await this.root.locator(".occ-world").evaluate((el) => (el as HTMLElement).style.transform);
    const m = /translate\(([-\d.e]+)px,\s*([-\d.e]+)px\)\s*scale\(([-\d.e]+)\)/.exec(t);
    if (!m) throw new Error(`unexpected camera transform: ${t}`);
    return { x: Number(m[1]), y: Number(m[2]), k: Number(m[3]) };
  }

  async screenOf(p: { x: number; y: number }): Promise<{ x: number; y: number }> {
    const [b, cam] = await Promise.all([this.rootBox(), this.camera()]);
    return { x: b.x + cam.x + p.x * cam.k, y: b.y + cam.y + p.y * cam.k };
  }

  /** Mouse drag between page points with intermediate moves (pointer events). */
  async drag(from: { x: number; y: number }, to: { x: number; y: number }, steps = 10): Promise<void> {
    const m = this.page.mouse;
    await m.move(from.x, from.y);
    await m.down();
    await m.move((from.x + to.x) / 2, (from.y + to.y) / 2, { steps });
    await m.move(to.x, to.y, { steps });
    await m.up();
  }

  /** Draws with a tool from/to canvas-relative points. Returns to Select. */
  async draw(tool: ToolLabel, from: [number, number], to: [number, number]): Promise<void> {
    await this.tool(tool);
    await this.drag(await this.at(...from), await this.at(...to));
  }

  async centerOf(id: string): Promise<{ x: number; y: number }> {
    const b = await this.item(id).boundingBox();
    if (!b) throw new Error(`item ${id} not visible`);
    return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
  }

  /** Clicks empty canvas (top-right area, away from chrome) to clear selection. */
  async clickEmpty(): Promise<void> {
    const b = await this.rootBox();
    await this.page.mouse.click(b.x + b.width - 60, b.y + 60);
  }

  async focus(): Promise<void> {
    await this.root.focus();
  }

  savedIndicator(): Locator {
    return this.page.getByRole("status").filter({ hasText: /^Saved$/ });
  }
}

/** Polls the API until the stored canvas document satisfies `check`. */
export async function waitForDoc(
  api: Api,
  canvasId: string,
  check: (doc: CanvasDoc, canvas: Canvas) => boolean,
  message = "saved canvas document",
  timeout = 20_000,
): Promise<Canvas> {
  let last: Canvas | null = null;
  await expect
    .poll(
      async () => {
        last = await api.getCanvas(canvasId);
        return check(last.document, last);
      },
      { message, timeout, intervals: [300, 500, 1000] },
    )
    .toBe(true);
  return last!;
}

export const ofType = (doc: CanvasDoc, type: string) => doc.items.filter((i) => i.type === type);
export const shapes = (doc: CanvasDoc, shape?: string) =>
  doc.items.filter((i) => i.type === "shape" && (!shape || i.shape === shape));

/** A minimal octodraw document with the given items. */
export const docOf = (items: CanvasDoc["items"]): CanvasDoc => ({ version: 1, items });
export const rect = (id: string, x: number, y: number, extra: Record<string, unknown> = {}) => ({
  id, type: "shape", shape: "rectangle", x, y, w: 160, h: 80, ...extra,
});
