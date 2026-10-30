import { CanvasUi, docOf, rect } from "../../helpers/canvas";
import { e2eTitle, expect, test } from "../../helpers/fixtures";

test("typing in a new text box shows one box (the editor), not a second selection outline", async ({ page, api, enter }) => {
  const c = await api.createCanvas(e2eTitle("text editor"));
  await api.updateCanvas(c.id, { document: docOf([rect("a", 0, 0, { text: "Box" })]) });
  await enter(`/c/${c.id}`);
  const ui = await new CanvasUi(page).ready({ items: 1 });
  await ui.tool("Text");
  const p = await ui.at(300, 600);
  await page.mouse.click(p.x, p.y);
  await expect(ui.root.locator("textarea.occ-editor")).toHaveCount(1);
  await expect(ui.root.locator(".occ-overlay > rect")).toHaveCount(0);
  await page.keyboard.type("Hi");
  await page.keyboard.press("Escape");
  // Done typing: the text is selected with its outline again.
  await expect(ui.root.locator(".occ-overlay > rect").first()).toBeVisible();
});
