import { CanvasUi, docOf, rect, waitForDoc } from "../../helpers/canvas";
import { e2eTitle, expect, test } from "../../helpers/fixtures";

test("autosave shows Saving…/Saved and a reload shows the identical document", async ({ page, api, enter }) => {
  const c = await api.createCanvas(e2eTitle("autosave"));
  await api.updateCanvas(c.id, { document: docOf([rect("a", 0, 0, { text: "Keep me" })]) });
  await enter(`/c/${c.id}`);
  const ui = await new CanvasUi(page).ready({ items: 1 });
  // Nothing edited yet: no indicator.
  await expect(ui.savedIndicator()).toHaveCount(0);

  await ui.draw("Ellipse", [250, 150], [400, 240]);
  await ui.draw("Rectangle", [450, 150], [600, 240]);
  // Debounced: Saving… then Saved.
  await expect(ui.savedIndicator()).toBeVisible({ timeout: 10_000 });
  const saved = await waitForDoc(api, c.id, (d) => d.items.length === 3, "3 items saved");

  const documentSaves: string[] = [];
  page.on("request", (r) => {
    if (r.method() === "PATCH" && r.url().includes(`/canvases/${c.id}`) && (r.postData() ?? "").includes('"document"')) documentSaves.push(r.url());
  });
  await page.reload();
  const again = await new CanvasUi(page).ready({ items: 3 });
  // Reopening doesn't save the document by itself (it may store a thumbnail).
  await page.waitForTimeout(2500);
  expect(documentSaves).toEqual([]);
  const after = await api.getCanvas(c.id);
  expect(after.document).toEqual(saved.document);
  // Every saved item is rendered.
  for (const item of saved.document.items) await expect(again.item(item.id)).toHaveCount(1);
});

test("an edit still pending when leaving the page is saved", async ({ page, api, enter }) => {
  const c = await api.createCanvas(e2eTitle("leave"));
  await enter(`/c/${c.id}`);
  const ui = await new CanvasUi(page).ready({ items: 0 });
  await ui.draw("Rectangle", [250, 150], [400, 240]);
  // Navigate away inside the app before the 1.2s debounce fires.
  await page.getByRole("link", { name: "Back" }).click();
  await page.waitForURL("**/workspace/canvases");
  await waitForDoc(api, c.id, (d) => d.items.length === 1, "pending edit flushed on unmount");
});

test("undoing back to the document as opened is saved too", async ({ page, api, enter }) => {
  // Regression: the save effect skipped any document identical to the one the
  // canvas opened with, so undoing every edit left the edit in the database.
  const c = await api.createCanvas(e2eTitle("undo to start"));
  await enter(`/c/${c.id}`);
  const ui = await new CanvasUi(page).ready({ items: 0 });
  await ui.draw("Rectangle", [250, 150], [400, 240]);
  await waitForDoc(api, c.id, (d) => d.items.length === 1, "shape saved");
  await ui.focus();
  await page.keyboard.press("ControlOrMeta+z");
  await expect(ui.items()).toHaveCount(0);
  await waitForDoc(api, c.id, (d) => d.items.length === 0, "undo to the opened document saved");
});
