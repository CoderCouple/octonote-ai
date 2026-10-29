import { CanvasUi, docOf, rect } from "../../helpers/canvas";
import { e2eTitle, expect, test } from "../../helpers/fixtures";

test("opening a canvas with content stores a thumbnail; a canvas-reference block shows it", async ({ page, api, enter }) => {
  const title = e2eTitle("thumbnail");
  const c = await api.createCanvas(title);
  await api.updateCanvas(c.id, { document: docOf([rect("a", 0, 0, { text: "Thumb", color: "blue" }), rect("b", 260, 0, { text: "Nail" })]) });
  expect((await api.getCanvas(c.id)).thumbnailUrl).toBeNull();

  await enter(`/c/${c.id}`);
  await new CanvasUi(page).ready({ items: 2 });
  let thumb: string | null = null;
  await expect.poll(async () => (thumb = (await api.getCanvas(c.id)).thumbnailUrl), { timeout: 30_000, message: "thumbnailUrl set" }).toBeTruthy();
  expect(thumb!).not.toMatch(/^data:/);
  const res = await fetch(thumb!);
  expect(res.status).toBe(200);
  expect(res.headers.get("content-type")).toMatch(/image\//);
  expect((await res.arrayBuffer()).byteLength).toBeGreaterThan(500);

  const note = await api.createNote(e2eTitle("reference note"));
  await api.updateNote(note.id, {
    document: { blocks: [{ id: "r1", type: "canvasReference", props: { canvasId: c.id }, children: [] }] },
  });
  await page.goto(`/n/${note.id}`);
  const card = page.getByRole("link").filter({ hasText: title });
  await expect(card).toBeVisible();
  const img = card.locator("img");
  await expect(img).toHaveAttribute("src", thumb!);
  await expect.poll(() => img.evaluate((el: HTMLImageElement) => el.naturalWidth)).toBeGreaterThan(0);
  await card.click();
  await page.waitForURL(`**/c/${c.id}`);
  await new CanvasUi(page).ready({ items: 2 });
});
