import { CanvasUi, ofType, waitForDoc } from "../../helpers/canvas";
import { e2eTitle, expect, test } from "../../helpers/fixtures";

test("insert a figure template from ⌘K; its PNG syncs to canvas_figures; a note embeds it", async ({ page, api, enter }) => {
  const c = await api.createCanvas(e2eTitle("figures"));
  await enter(`/c/${c.id}`);
  const ui = await new CanvasUi(page).ready({ items: 0 });

  await ui.focus();
  await page.keyboard.press("ControlOrMeta+k");
  const palette = page.getByRole("dialog", { name: "Insert" });
  await expect(palette).toBeVisible();
  await palette.getByRole("textbox", { name: "Search" }).fill("Flowchart");
  await palette.locator(".occ-palette-row", { hasText: "Flowchart" }).first().click();
  await expect(palette).toHaveCount(0);

  // The figure renders its diagram (an SVG with nodes inside the figure box).
  const figure = ui.root.locator(".occ-figure").first();
  await expect(figure).toBeVisible();
  await expect(figure.locator(".occ-figure-body svg").first()).toBeVisible();
  await expect.poll(() => figure.locator(".occ-figure-body svg text").count()).toBeGreaterThan(2);

  const saved = await waitForDoc(api, c.id, (d) => ofType(d, "figure").length === 1, "figure saved");
  const item = ofType(saved.document, "figure")[0]!;
  expect(item.source).toMatch(/\S/);

  // The canvas exports the figure's PNG to the API a few seconds after saving.
  let figures: Awaited<ReturnType<typeof api.listCanvasFigures>> = [];
  await expect
    .poll(async () => (figures = await api.listCanvasFigures(c.id)).filter((f) => f.imageUrl).length, { timeout: 30_000 })
    .toBe(1);
  const fig = figures[0]!;
  expect(fig.id).toMatch(/^fig_/);
  expect(Number(fig.width)).toBeGreaterThan(0);
  const png = await fetch(fig.imageUrl as string);
  expect(png.status).toBe(200);
  expect(png.headers.get("content-type")).toMatch(/image\/png/);

  // A note embedding the figure shows its image.
  const note = await api.createNote(e2eTitle("figure note"));
  await api.updateNote(note.id, {
    document: { blocks: [
      { id: "p1", type: "paragraph", props: {}, content: [{ type: "text", text: "Here is the figure:", styles: {} }], children: [] },
      { id: "f1", type: "figure", props: { figureId: fig.id, title: "", imageUrl: "", width: 0, height: 0, widthPct: 100 }, children: [] },
    ] },
  });
  await page.goto(`/n/${note.id}`);
  const img = page.locator(`img[src="${fig.imageUrl}"]`);
  await expect(img).toBeVisible();
  await expect.poll(() => img.evaluate((el: HTMLImageElement) => el.naturalWidth)).toBeGreaterThan(0);

  // Deleting the figure on the canvas removes its row.
  await page.goto(`/c/${c.id}`);
  const ui2 = await new CanvasUi(page).ready({ items: 1 });
  const fc = await ui2.centerOf(item.id);
  await page.mouse.click(fc.x, fc.y);
  await page.keyboard.press("Delete");
  await expect(ui2.items()).toHaveCount(0);
  await expect.poll(async () => (await api.listCanvasFigures(c.id)).length, { timeout: 30_000 }).toBe(0);
});
