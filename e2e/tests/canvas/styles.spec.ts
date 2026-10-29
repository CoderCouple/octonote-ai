import { CanvasUi, docOf, rect, waitForDoc } from "../../helpers/canvas";
import { WEB_URL } from "../../helpers/env";
import { e2eTitle, expect, test } from "../../helpers/fixtures";

test.describe("line bend, shape fill / dashed / label alignment, links", () => {
  test("dragging a line's middle handle bends it and saves `bend`", async ({ page, api, enter }) => {
    const c = await api.createCanvas(e2eTitle("bend"));
    await api.updateCanvas(c.id, {
      document: docOf([
        rect("a", 0, 0),
        rect("b", 500, 0),
        { id: "l", type: "line", x: 160, y: 40, w: 340, h: 0, start: { x: 160, y: 40, item: "a" }, end: { x: 500, y: 40, item: "b" }, endArrow: true },
      ]),
    });
    await enter(`/c/${c.id}`);
    const ui = await new CanvasUi(page).ready({ items: 3 });

    // Click the line halfway between the boxes to select it.
    const mid = await ui.screenOf({ x: 330, y: 40 });
    await page.mouse.click(mid.x, mid.y);
    const bend = ui.root.locator('.occ-handle-bend[data-for="l"]');
    await expect(bend).toHaveCount(1);
    const hb = (await bend.boundingBox())!;
    const from = { x: hb.x + hb.width / 2, y: hb.y + hb.height / 2 };
    await ui.drag(from, { x: from.x, y: from.y - 90 });

    const saved = await waitForDoc(api, c.id, (d) => Math.abs(d.items.find((i) => i.id === "l")?.bend ?? 0) > 20, "line bend saved");
    const line = saved.document.items.find((i) => i.id === "l")!;
    // Still attached at both ends.
    expect(line.start.item).toBe("a");
    expect(line.end.item).toBe("b");
    // The drawn path is a quadratic curve now.
    await expect(ui.item("l").locator('path[d*="Q"]').first()).toBeAttached();

    // Dragging it back to the chord straightens it.
    const hb2 = (await bend.boundingBox())!;
    await ui.drag({ x: hb2.x + hb2.width / 2, y: hb2.y + hb2.height / 2 }, mid);
    await waitForDoc(api, c.id, (d) => !d.items.find((i) => i.id === "l")?.bend, "line straightened");
  });

  test("fill cycles tint → solid → none, dashed outline, label align / valign", async ({ page, api, enter }) => {
    const c = await api.createCanvas(e2eTitle("styles"));
    await api.updateCanvas(c.id, { document: docOf([rect("a", 0, 0, { text: "Label", color: "blue", w: 240, h: 140 })]) });
    await enter(`/c/${c.id}`);
    const ui = await new CanvasUi(page).ready({ items: 1 });
    const shape = async () => (await api.getCanvas(c.id)).document.items[0]!;
    const a = await ui.centerOf("a");
    await page.mouse.click(a.x, a.y);
    const bar = ui.selbar();

    const pathFill = () => ui.item("a").locator("path").first().getAttribute("fill");
    const tintFill = await pathFill();
    await bar.getByRole("button", { name: "Fill: tint" }).click();
    await waitForDoc(api, c.id, (d) => d.items[0]!.fill === "solid", "fill solid");
    const solidFill = await pathFill();
    expect(solidFill).not.toBe(tintFill);
    await bar.getByRole("button", { name: "Fill: solid" }).click();
    await waitForDoc(api, c.id, (d) => d.items[0]!.fill === "none", "fill none");
    expect(await pathFill()).toMatch(/none|transparent/);
    await bar.getByRole("button", { name: "Fill: none" }).click();
    await waitForDoc(api, c.id, (d) => (d.items[0]!.fill ?? "tint") === "tint", "fill back to tint");

    await bar.getByRole("button", { name: "Dashed outline" }).click();
    await waitForDoc(api, c.id, (d) => d.items[0]!.dashed === true, "dashed saved");
    await expect(ui.item("a").locator("path").first()).toHaveAttribute("stroke-dasharray", /\d/);
    await bar.getByRole("button", { name: "Dashed outline" }).click();
    await waitForDoc(api, c.id, (d) => !d.items[0]!.dashed, "dashed off");

    await bar.getByRole("button", { name: "Text alignment: center" }).click();
    await waitForDoc(api, c.id, (d) => d.items[0]!.align === "right", "align right");
    await bar.getByRole("button", { name: "Text alignment: right" }).click();
    await waitForDoc(api, c.id, (d) => d.items[0]!.align === "left", "align left");
    await expect(ui.item("a").locator(".occ-shape-text")).toHaveCSS("text-align", "left");

    await bar.getByRole("button", { name: "Vertical text position: middle" }).click();
    await waitForDoc(api, c.id, (d) => d.items[0]!.valign === "bottom", "valign bottom");
    await bar.getByRole("button", { name: "Vertical text position: bottom" }).click();
    await waitForDoc(api, c.id, (d) => d.items[0]!.valign === "top", "valign top");
    await expect(ui.item("a").locator(".occ-shape-text")).toHaveCSS("align-items", "flex-start");
    expect(await shape()).toMatchObject({ text: "Label", color: "blue", align: "left", valign: "top" });
  });

  test("a shape with a link shows a badge that opens the URL in a new tab", async ({ page, context, api, enter }) => {
    const link = `${WEB_URL}/terms`;
    const c = await api.createCanvas(e2eTitle("link"));
    await api.updateCanvas(c.id, { document: docOf([rect("a", 0, 0, { text: "Docs", link })]) });
    await enter(`/c/${c.id}`);
    const ui = await new CanvasUi(page).ready({ items: 1 });
    const badge = ui.item("a").locator(".occ-link-badge");
    await expect(badge).toHaveAttribute("href", link);
    await expect(badge).toHaveAttribute("target", "_blank");
    const [popup] = await Promise.all([context.waitForEvent("page"), badge.click()]);
    await popup.waitForLoadState("domcontentloaded");
    expect(popup.url()).toBe(link);
    await popup.close();
    // Unsafe schemes never get a badge.
    await api.updateCanvas(c.id, { document: docOf([rect("a", 0, 0, { text: "Bad", link: "javascript:alert(1)" })]) });
    await page.reload();
    await new CanvasUi(page).ready({ items: 1 });
    await expect(ui.item("a").locator(".occ-link-badge")).toHaveCount(0);
  });
});
