import { CanvasUi, docOf, rect, waitForDoc } from "../../helpers/canvas";
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

test("the selection bar's Edit text opens the label editor of an arrow and of a box", async ({ page, api, enter }) => {
  const c = await api.createCanvas(e2eTitle("edit text"));
  await api.updateCanvas(c.id, {
    document: docOf([
      rect("a", 0, 0, { text: "Valid?" }),
      rect("b", 300, 300, { text: "Save" }),
      { id: "l", type: "line", x: 80, y: 80, w: 300, h: 220, start: { x: 80, y: 80, item: "a" }, end: { x: 380, y: 300, item: "b" }, endArrow: true, text: "Yes" },
    ]),
  });
  await enter(`/c/${c.id}`);
  const ui = await new CanvasUi(page).ready({ items: 3 });
  const editor = ui.root.locator("textarea.occ-editor");

  await ui.item("b").click();
  await ui.selbar().getByRole("button", { name: "Edit text" }).click();
  await expect(editor).toHaveValue("Save");
  await editor.fill("Saved");
  await editor.press("Enter");

  await ui.item("l").locator("path").nth(1).click({ force: true });
  await ui.selbar().getByRole("button", { name: "Edit text" }).click();
  await expect(editor).toHaveValue("Yes");
  await editor.fill("Yes, valid");
  await editor.press("Enter");
  await waitForDoc(api, c.id, (d) => d.items.some((i) => i.id === "l" && i.text === "Yes, valid") && d.items.some((i) => i.id === "b" && i.text === "Saved"), "both edited");
});
