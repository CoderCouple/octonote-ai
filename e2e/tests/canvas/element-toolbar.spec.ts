import { CanvasUi, docOf, waitForDoc } from "../../helpers/canvas";
import { e2eTitle, expect, test } from "../../helpers/fixtures";

const SOURCE = "title Checkout\nCart [icon: shopping-cart]\nPayment\nCart > Payment";
const sourceOf = (d: { items: unknown[] }) => (d.items.find((i) => (i as { id: string }).id === "f1") as { source: string }).source;

test("the element toolbar restyles boxes and arrows inside an opened figure through its code, with undo", async ({ page, api, enter }) => {
  const c = await api.createCanvas(e2eTitle("element toolbar"));
  await api.updateCanvas(c.id, { document: docOf([{ id: "f1", type: "figure", x: 0, y: 0, w: 700, h: 360, source: SOURCE, autoSize: false }]) });
  await enter(`/c/${c.id}`);
  const ui = await new CanvasUi(page).ready({ items: 1 });

  // Open the figure, then select a box inside it.
  await ui.item("f1").dblclick();
  const figure = ui.item("f1");
  await figure.locator('[data-node-id="Payment"]').first().click();
  const bar = page.getByRole("toolbar", { name: /box/i });
  await expect(bar).toBeVisible();
  await expect(bar.getByRole("button", { name: "Edit text" })).toBeVisible();

  // Colour → blue: the code gets `color: blue` on Payment's line (it's only declared once).
  await bar.getByRole("button", { name: /^Colou?r/ }).click();
  await page.getByRole("menuitemradio", { name: "Blue", exact: true }).click();
  await waitForDoc(api, c.id, (d) => /Payment \[color: blue\]/.test(sourceOf(d)), "colour saved in the code");

  // Undo inside the opened figure takes it back out.
  // Escape clears the selection (the bar goes away); ⌘Z still undoes.
  await page.keyboard.press("Escape");
  await expect(page.getByRole("toolbar", { name: /box/i })).toHaveCount(0);
  await page.keyboard.press("ControlOrMeta+z");
  await waitForDoc(api, c.id, (d) => !sourceOf(d).includes("color: blue"), "undo saved");

  // Rename the box: every reference changes.
  await figure.locator('[data-node-id="Payment"]').first().click();
  await page.getByRole("toolbar", { name: /box/i }).getByRole("button", { name: "Edit text" }).click();
  const input = page.getByRole("textbox").last();
  await input.fill("Billing");
  await input.press("Enter");
  await waitForDoc(api, c.id, (d) => sourceOf(d).includes("Cart > Billing") && !sourceOf(d).includes("Payment"), "rename saved");

  // Select the arrow and make it dashed.
  await figure.locator("[data-edge-id]").first().click({ force: true });
  const arrowBar = page.getByRole("toolbar", { name: /arrow/i });
  await expect(arrowBar).toBeVisible();
  await arrowBar.getByRole("button", { name: /^Line/ }).click();
  await page.getByRole("radio", { name: "Dashed" }).or(page.getByRole("menuitemradio", { name: "Dashed" })).or(page.getByRole("button", { name: "Dashed" })).first().click();
  await waitForDoc(api, c.id, (d) => sourceOf(d).includes("Cart --> Billing"), "dashed arrow saved");
  await page.screenshot({ path: test.info().outputPath("element-toolbar.png") });
});
