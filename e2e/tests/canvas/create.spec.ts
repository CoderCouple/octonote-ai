import { CanvasUi } from "../../helpers/canvas";
import { e2eTitle, expect, test } from "../../helpers/fixtures";

const canvasIdFrom = (url: string) => /\/c\/([^/?#]+)/.exec(url)?.[1];

test.describe("create a blank canvas", () => {
  test("from the Canvases list, then rename it", async ({ page, api, enter }) => {
    await enter("/workspace/canvases");
    await page.getByRole("button", { name: "New canvas" }).first().click();
    await page.waitForURL(/\/c\/[^/]+$/);
    const id = canvasIdFrom(page.url())!;
    api.track("canvas", id);

    const canvas = await new CanvasUi(page).ready({ items: 0 });
    await expect(canvas.rail()).toBeVisible();
    const created = await api.getCanvas(id);
    expect(created.title).toBe("Untitled canvas");
    expect(created.document.items).toEqual([]);

    const title = e2eTitle("renamed canvas");
    await page.getByRole("button", { name: "Untitled canvas" }).click();
    const input = page.locator("header input").first();
    await input.fill(title);
    await input.press("Enter");
    await expect(page.getByRole("button", { name: title })).toBeVisible();
    await expect.poll(async () => (await api.getCanvas(id)).title).toBe(title);

    // The new name shows in the list.
    await page.goto("/workspace/canvases");
    await expect(page.getByText(title).first()).toBeVisible();
  });

  test("Home lists it under Recent canvases and opens it", async ({ page, api, enter }) => {
    // Web Home has no "+" menu (that is the mobile tab header); its per-kind
    // "New canvas" button only shows while the section is empty. An edited
    // canvas must show up under Recent canvases and open from there.
    const title = e2eTitle("home canvas");
    const c = await api.createCanvas(title);
    await api.updateCanvas(c.id, { document: { version: 1, items: [{ id: "a", type: "shape", shape: "rectangle", x: 0, y: 0, w: 160, h: 80, text: "Hi" }] } });
    await enter("/workspace/home");
    const card = page.getByRole("link", { name: new RegExp(title) }).first();
    await expect(card).toBeVisible();
    await card.click();
    await page.waitForURL(`**/c/${c.id}`);
    await new CanvasUi(page).ready({ items: 1 });
  });

  test("from a notebook's New ▾ menu (the create menu)", async ({ page, api, enter }) => {
    const nb = await api.createNotebook(e2eTitle("create menu notebook"));
    await enter(`/nb/${nb.id}`);
    await page.getByRole("button", { name: /^New/ }).first().click();
    await page.getByRole("menuitem", { name: "Canvas" }).click();
    await page.waitForURL(/\/c\/[^/]+$/);
    const id = canvasIdFrom(page.url())!;
    api.track("canvas", id);
    await new CanvasUi(page).ready({ items: 0 });
    const created = await api.getCanvas(id);
    expect(created.notebookId).toBe(nb.id);
    expect(created.document).toMatchObject({ version: 1, items: [] });
  });
});
