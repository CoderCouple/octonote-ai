import { CanvasUi, docOf, rect, waitForDoc } from "../../helpers/canvas";
import type { CanvasDoc } from "../../helpers/api";
import { e2eTitle, expect, test } from "../../helpers/fixtures";

const line = (id: string, from: string, to: string) => ({
  id, type: "line", x: 0, y: 0, w: 1, h: 1, start: { x: 0, y: 0, item: from }, end: { x: 1, y: 1, item: to }, endArrow: true,
});
// A messy diagram: a → b → c, a → d, scattered.
const MESSY = docOf([
  rect("a", 600, 400, { text: "A" }),
  rect("b", 0, 0, { text: "B" }),
  rect("c", 900, 50, { text: "C" }),
  rect("d", 200, 600, { text: "D" }),
  line("ab", "a", "b"),
  line("bc", "b", "c"),
  line("ad", "a", "d"),
]);
const pos = (d: CanvasDoc) => Object.fromEntries(d.items.filter((i) => i.type === "shape").map((i) => [i.id, [Math.round(i.x), Math.round(i.y)]]));

for (const direction of ["vertical", "horizontal"] as const) {
  test(`Rearrange ${direction}ly lays the canvas out and is one undo step`, async ({ page, api, enter }) => {
    const c = await api.createCanvas(e2eTitle(`rearrange ${direction}`));
    await api.updateCanvas(c.id, { document: MESSY });
    const original = pos((await api.getCanvas(c.id)).document);
    await enter(`/c/${c.id}`);
    const ui = await new CanvasUi(page).ready({ items: 7 });

    await page.getByRole("button", { name: "Rearrange", exact: true }).click();
    await page.getByRole("menuitem", { name: `Rearrange ${direction}ly` }).click();
    await expect(page.getByText("Rearranged")).toBeVisible();
    const after = await waitForDoc(api, c.id, (d) => JSON.stringify(pos(d)) !== JSON.stringify(original), "positions changed");
    const p = pos(after.document);
    // Flow direction: A comes before B (its child) along the main axis.
    const axis = direction === "vertical" ? 1 : 0;
    expect(p.a![axis]).toBeLessThan(p.b![axis]);
    expect(p.b![axis]).toBeLessThan(p.c![axis]);
    // Lines stay attached.
    for (const l of after.document.items.filter((i) => i.type === "line")) expect(l.start.item && l.end.item).toBeTruthy();

    // One undo step restores the original layout.
    await ui.focus();
    await page.keyboard.press("ControlOrMeta+z");
    // The editor shows the original layout again…
    await expect(ui.item("a")).toHaveCSS("left", "600px");
    await expect(ui.item("b")).toHaveCSS("left", "0px");
    // …and that is what gets saved.
    await waitForDoc(api, c.id, (d) => JSON.stringify(pos(d)) === JSON.stringify(original), "undo restored positions");
    await page.keyboard.press("Shift+ControlOrMeta+z");
    await waitForDoc(api, c.id, (d) => JSON.stringify(pos(d)) === JSON.stringify(p), "redo re-applied the layout");
  });
}

test("Rearrange's toast Undo restores the layout; an empty canvas explains itself", async ({ page, api, enter }) => {
  const c = await api.createCanvas(e2eTitle("rearrange toast"));
  await api.updateCanvas(c.id, { document: MESSY });
  const original = pos((await api.getCanvas(c.id)).document);
  await enter(`/c/${c.id}`);
  await new CanvasUi(page).ready({ items: 7 });
  await page.getByRole("button", { name: "Rearrange", exact: true }).click();
  await page.getByRole("menuitem", { name: "Rearrange vertically" }).click();
  await waitForDoc(api, c.id, (d) => JSON.stringify(pos(d)) !== JSON.stringify(original), "positions changed");
  await page.locator("[data-sonner-toast]").getByRole("button", { name: "Undo" }).click();
  await waitForDoc(api, c.id, (d) => JSON.stringify(pos(d)) === JSON.stringify(original), "toast undo restored positions");

  const empty = await api.createCanvas(e2eTitle("rearrange empty"));
  await page.goto(`/c/${empty.id}`);
  await new CanvasUi(page).ready({ items: 0 });
  await page.getByRole("button", { name: "Rearrange", exact: true }).click();
  await page.getByRole("menuitem", { name: "Rearrange vertically" }).click();
  await expect(page.getByText("Add a few shapes first, then rearrange them.")).toBeVisible();
});
