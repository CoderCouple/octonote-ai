import { CanvasUi, docOf, waitForDoc } from "../../helpers/canvas";
import { e2eTitle, expect, test } from "../../helpers/fixtures";

const SOURCE = "title Checkout\nCart > Payment";

test("a figure's code opens beside the canvas; typing redraws it, saves, and undoes as one step", async ({ page, api, enter }) => {
  const c = await api.createCanvas(e2eTitle("figure code"));
  await api.updateCanvas(c.id, { document: docOf([{ id: "f1", type: "figure", x: 0, y: 0, w: 520, h: 300, source: SOURCE, autoSize: false }]) });
  await enter(`/c/${c.id}`);
  const ui = await new CanvasUi(page).ready({ items: 1 });

  await ui.item("f1").click();
  await ui.root.getByRole("button", { name: "Edit code" }).click();
  const code = page.getByRole("textbox", { name: "Figure code" });
  await expect(code).toHaveValue(SOURCE);

  // Type a new box and an arrow to it.
  await code.evaluate((el: HTMLTextAreaElement) => el.setSelectionRange(el.value.length, el.value.length));
  await code.pressSequentially("\nPayment > Receipt");
  await expect(ui.item("f1").getByText("Receipt")).toBeVisible();
  await waitForDoc(api, c.id, (d) => JSON.stringify(d).includes("Payment > Receipt"), "code edit saved");

  // Undo (with focus back on the canvas) removes the whole burst of typing.
  await page.getByRole("button", { name: "Close code" }).click();
  await expect(code).toHaveCount(0);
  await ui.focus();
  await page.keyboard.press("ControlOrMeta+z");
  await expect(ui.item("f1").getByText("Receipt")).toHaveCount(0);
  await waitForDoc(api, c.id, (d) => !JSON.stringify(d).includes("Receipt"), "undo saved");

  // A mistake in the code shows inline, with its line.
  await ui.item("f1").click();
  await ui.root.getByRole("button", { name: "Edit code" }).click();
  await code.evaluate((el: HTMLTextAreaElement) => el.setSelectionRange(el.value.length, el.value.length));
  await code.pressSequentially("\nBad [color");
  await expect(page.getByText(/^Line 3: Missing closing/)).toBeVisible();
});
