import { CanvasUi, docOf, rect } from "../../helpers/canvas";
import { e2eTitle, expect, test } from "../../helpers/fixtures";

const frame = (id: string, x: number, y: number) => ({ id, type: "frame", device: "browser", title: id, x, y, w: 480, h: 320 });

test("presenting a frame shows only that slide, not what's next to it on the canvas", async ({ page, api, enter }) => {
  const c = await api.createCanvas(e2eTitle("present"));
  await api.updateCanvas(c.id, {
    document: docOf([
      frame("one", 0, 0),
      rect("inside", 120, 120, { text: "On the slide" }),
      // Right next to the frame: inside the camera's margin when the slide is shown.
      rect("beside", 500, 100, { text: "Not on the slide" }),
      frame("two", 1400, 0),
    ]),
  });
  await enter(`/c/${c.id}`);
  const ui = await new CanvasUi(page).ready({ items: 4 });
  await ui.root.getByRole("button", { name: "Present" }).click();
  await expect(page.getByText("1 / 2")).toBeVisible();
  await page.waitForTimeout(800); // camera glide

  // What's drawn at a point: clipped-away items are neither painted nor hit.
  const topItemAt = async (id: string) => {
    const b = await ui.item(id).boundingBox();
    if (!b) return null;
    const x = b.x + Math.min(b.width / 2, 20);
    const y = b.y + b.height / 2;
    return page.evaluate(([px, py]) => document.elementFromPoint(px!, py!)?.closest("[data-item-id]")?.getAttribute("data-item-id") ?? null, [x, y]);
  };
  const vp = page.viewportSize()!;
  const beside = await ui.item("beside").boundingBox();
  // The neighbour is inside the window (so without clipping it would show)…
  expect(beside && beside.x < vp.width).toBe(true);
  // …but nothing of it is drawn; the slide's own content is.
  expect(await topItemAt("beside")).not.toBe("beside");
  expect(await topItemAt("inside")).toBe("inside");
  await page.screenshot({ path: test.info().outputPath("slide-1.png") });

  // Next slide: the clip moves with it.
  await page.keyboard.press("ArrowRight");
  await expect(page.getByText("2 / 2")).toBeVisible();
  await page.waitForTimeout(800);
  expect(await topItemAt("inside")).not.toBe("inside");

  // Stopping restores the full canvas.
  await page.keyboard.press("Escape");
  await expect(ui.root.getByRole("button", { name: "Present" })).toBeVisible();
  await expect.poll(() => ui.root.locator(".occ-world").evaluate((el) => getComputedStyle(el).clipPath)).toBe("none");
});

test("presenting figures shows one figure at a time", async ({ page, api, enter }) => {
  // Tall figures (top-to-bottom flow), so a slide leaves wide margins left and right.
  const fig = (id: string, x: number, title: string) => ({ id, type: "figure", x, y: 0, w: 300, h: 700, source: `title ${title}\ndirection down\nA > B > C > D`, autoSize: false });
  const c = await api.createCanvas(e2eTitle("present figures"));
  // Close together, as on a real canvas: the second sits in the first slide's margin.
  await api.updateCanvas(c.id, { document: docOf([fig("f1", 0, "First"), fig("f2", 400, "Second")]) });
  await enter(`/c/${c.id}`);
  const ui = await new CanvasUi(page).ready({ items: 2 });
  await ui.root.getByRole("button", { name: "Present" }).click();
  await expect(page.getByText("1 / 2")).toBeVisible();
  await page.waitForTimeout(1500);

  const drawnAt = async (id: string) => {
    const b = await ui.item(id).boundingBox();
    if (!b) return null;
    const vp = page.viewportSize()!;
    const x = Math.min(Math.max(b.x + 30, 1), vp.width - 2);
    const y = Math.min(Math.max(b.y + b.height / 2, 1), vp.height - 2);
    return page.evaluate(([px, py]) => document.elementFromPoint(px!, py!)?.closest("[data-item-id]")?.getAttribute("data-item-id") ?? null, [x, y]);
  };
  const second = (await ui.item("f2").boundingBox())!;
  expect(second.x).toBeLessThan(page.viewportSize()!.width); // would be in view without clipping
  expect(await drawnAt("f2")).not.toBe("f2");
  expect(await drawnAt("f1")).toBe("f1");
  await page.screenshot({ path: test.info().outputPath("figure-slide-1.png") });

  await page.keyboard.press("ArrowRight");
  await expect(page.getByText("2 / 2")).toBeVisible();
  await page.waitForTimeout(1500);
  expect(await drawnAt("f2")).toBe("f2");
  const first = (await ui.item("f1").boundingBox())!;
  if (first.x + first.width > 0) expect(await drawnAt("f1")).not.toBe("f1");
  await page.screenshot({ path: test.info().outputPath("figure-slide-2.png") });
});

test("a published canvas can be presented by signed-out readers", async ({ api, anonContext }) => {
  const fig = (id: string, x: number, title: string) => ({ id, type: "figure", x, y: 0, w: 300, h: 700, source: `title ${title}\ndirection down\nA > B > C`, autoSize: false });
  const c = await api.createCanvas(e2eTitle("published present"));
  await api.updateCanvas(c.id, { document: docOf([fig("f1", 0, "First"), fig("f2", 400, "Second")]) });
  const { publicSlug } = await api.publish("canvas", c.id);

  const page = await (await anonContext({ viewport: { width: 1400, height: 900 } })).newPage();
  await page.goto(`/pub/${publicSlug}`);
  const ui = await new CanvasUi(page).ready({ items: 2 });
  await page.screenshot({ path: test.info().outputPath("published-page.png") });
  await page.getByRole("button", { name: "Present" }).click();
  await expect(page.getByText("1 / 2")).toBeVisible();
  // The page's own controls step aside; the slide shows alone.
  await expect(page.getByRole("button", { name: "Zoom in" })).toHaveCount(0);
  await page.waitForTimeout(1200);
  await page.screenshot({ path: test.info().outputPath("published-present.png") });
  await page.keyboard.press("ArrowRight");
  await expect(page.getByText("2 / 2")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("button", { name: "Zoom in" })).toBeVisible();
  await expect(ui.root).toBeVisible();

  // Phones get it in the bottom bar.
  const phone = await (await anonContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })).newPage();
  await phone.goto(`/pub/${publicSlug}`);
  await new CanvasUi(phone).ready({ items: 2 });
  await expect(phone.getByRole("button", { name: "Present" })).toBeVisible();
});
