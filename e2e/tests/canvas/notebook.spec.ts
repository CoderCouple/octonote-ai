import { CanvasUi, docOf, rect } from "../../helpers/canvas";
import { e2eTitle, expect, test } from "../../helpers/fixtures";
import { WEB_URL } from "../../helpers/env";

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

test("note cards show the note's first image; a project without a canvas picture gets one", async ({ page, api, enter, anonContext }) => {
  const img = new URL("/brand-logo-120.png", WEB_URL).href;
  const nb = await api.createNotebook(e2eTitle("cards"));
  const pictured = await api.createNote(e2eTitle("pictured note"), { markdown: `Some words.\n\n![Logo](${img})`, notebookId: nb.id });
  const plain = await api.createNote(e2eTitle("plain note"), { markdown: "Only words here.", notebookId: nb.id });
  const p = await api.createProject(e2eTitle("project"), { notebookId: nb.id });
  await api.updateCanvas(p.canvasId, { document: docOf([rect("a", 0, 0, { text: "Diagram" })]) });
  expect((await api.getCanvas(p.canvasId)).thumbnailUrl).toBeNull();

  await enter(`/nb/${nb.id}`);
  await page.getByRole("button", { name: /grid/i }).first().click().catch(() => undefined);
  const card = (id: string) => page.locator(`a[href$="/${id}"]`).first();
  await expect(card(pictured.id).locator(`img[src="${img}"]`)).toBeVisible();
  await expect(card(plain.id).locator("img")).toHaveCount(0);
  // Opening the notebook makes the project's canvas a picture in the background.
  await expect.poll(async () => (await api.getCanvas(p.canvasId)).thumbnailUrl, { timeout: 30_000 }).not.toBeNull();

  // The published notebook shows the same pictures.
  const { publicSlug } = await api.publish("notebook", nb.id);
  const reader = await (await anonContext({ viewport: { width: 1400, height: 900 } })).newPage();
  await reader.goto(`/pub/${publicSlug}`);
  await expect(reader.locator(`img[src="${img}"]`).first()).toBeVisible();
  const thumb = (await api.getCanvas(p.canvasId)).thumbnailUrl!;
  await expect(reader.locator(`img[src="${thumb}"]`).first()).toBeVisible();
  await reader.screenshot({ path: test.info().outputPath("published-notebook.png") });
});
