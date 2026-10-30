import { CanvasUi, docOf, ofType, rect, waitForDoc } from "../../helpers/canvas";
import { e2eTitle, expect, test } from "../../helpers/fixtures";

test("double-clicking an arrow's label edits it (no stray text box under the bend handle)", async ({ page, api, enter }) => {
  const c = await api.createCanvas(e2eTitle("line label"));
  await api.updateCanvas(c.id, {
    document: docOf([
      rect("a", 0, 0, { text: "Valid?" }),
      rect("b", 300, 300, { text: "Save" }),
      { id: "l", type: "line", x: 80, y: 80, w: 300, h: 220, start: { x: 80, y: 80, item: "a" }, end: { x: 380, y: 300, item: "b" }, endArrow: true, text: "Yes" },
    ]),
  });
  await enter(`/c/${c.id}`);
  const ui = await new CanvasUi(page).ready({ items: 3 });
  const label = (await ui.root.getByText("Yes", { exact: true }).first().boundingBox())!;
  const at = { x: label.x + label.width / 2, y: label.y + label.height / 2 };

  // The first click selects the arrow, which puts its bend handle on the label.
  await page.mouse.click(at.x, at.y);
  await page.mouse.dblclick(at.x, at.y);
  const editor = ui.root.locator("textarea.occ-editor");
  await expect(editor).toHaveCount(1);
  await expect(editor).toHaveValue("Yes");
  await editor.fill("Yes, valid");
  await editor.press("Enter");
  await waitForDoc(api, c.id, (d) => ofType(d, "line")[0]?.text === "Yes, valid" && ofType(d, "text").length === 0, "label edited, no new text item");
});
