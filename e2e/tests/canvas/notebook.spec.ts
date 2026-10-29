import { CanvasUi, docOf, rect } from "../../helpers/canvas";
import { e2eTitle, expect, test } from "../../helpers/fixtures";

test("move a canvas into a notebook from the Canvases list; it opens from the notebook", async ({ page, api, enter }) => {
  const nbName = e2eTitle("notebook");
  const nb = await api.createNotebook(nbName);
  const title = e2eTitle("canvas to move");
  const c = await api.createCanvas(title);
  await api.updateCanvas(c.id, { document: docOf([rect("a", 0, 0, { text: "Moved" })]) });

  await enter("/workspace/canvases");
  const row = page.getByRole("row").filter({ hasText: title });
  await expect(row).toBeVisible();
  await row.getByRole("button", { name: "Move to notebook" }).click();
  const dialog = page.getByRole("dialog", { name: "Move to notebook" });
  await dialog.getByRole("button", { name: nbName }).click();
  await dialog.getByRole("button", { name: "Move", exact: true }).click();
  await expect(dialog).toBeHidden();
  await expect.poll(async () => (await api.getCanvas(c.id)).notebookId).toBe(nb.id);

  await page.goto(`/nb/${nb.id}`);
  const link = page.getByRole("link", { name: new RegExp(title) }).first();
  await expect(link).toBeVisible();
  await link.click();
  await page.waitForURL(`**/c/${c.id}`);
  await new CanvasUi(page).ready({ items: 1 });
  // Back goes to the notebook now.
  await expect(page.getByRole("link", { name: "Back" })).toHaveAttribute("href", `/nb/${nb.id}`);

  // Moving it out again (API) takes it back to the top level.
  await api.move("canvas", c.id, null);
  expect((await api.getCanvas(c.id)).notebookId).toBeNull();
});
