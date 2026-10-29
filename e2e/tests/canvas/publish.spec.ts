import type { Page } from "@playwright/test";
import { CanvasUi, docOf, rect } from "../../helpers/canvas";
import { e2eTitle, expect, test } from "../../helpers/fixtures";

const FIGURE = { id: "fig1", type: "figure", x: 0, y: 260, w: 360, h: 220, source: "title Checkout flow\nCart > Payment > Receipt", autoSize: true };
const DOC = docOf([rect("a", 0, 0, { text: "Published A" }), rect("b", 300, 0, { text: "Published B", color: "blue" }), FIGURE]);

const luminance = (page: Page) =>
  page.evaluate(() => {
    const m = getComputedStyle(document.body).backgroundColor.match(/\d+(\.\d+)?/g)!.map(Number);
    return (0.2126 * m[0]! + 0.7152 * m[1]! + 0.0722 * m[2]!) / 255;
  });

test.describe("sharing and publishing a canvas", () => {
  test("publish from the Share dialog → /pub renders signed out (light, dark, phone); unpublish → 404", async ({ page, api, enter, anonContext, consoleProblems }) => {
    const title = e2eTitle("published canvas");
    const c = await api.createCanvas(title);
    await api.updateCanvas(c.id, { document: DOC });
    await enter(`/c/${c.id}`);
    await new CanvasUi(page).ready({ items: 3 });

    await page.getByRole("button", { name: "Share" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByRole("switch", { name: "Publish to web" }).click();
    const url = dialog.getByLabel("Public URL");
    await expect(url).toHaveValue(/\/pub\/[^/]+$/);
    const slug = (await url.inputValue()).split("/pub/")[1]!;
    expect((await api.getCanvas(c.id)).publicSlug).toBe(slug);
    await page.keyboard.press("Escape");

    // Desktop, light.
    const light = await (await anonContext({ colorScheme: "light", viewport: { width: 1400, height: 900 } })).newPage();
    await light.goto(`/pub/${slug}`);
    const pub = await new CanvasUi(light).ready({ items: 3 });
    await expect(light.getByText(title).first()).toBeVisible();
    await expect(pub.rail()).toHaveCount(0);
    await expect(pub.root.getByText("Published B")).toBeVisible();
    expect(await luminance(light)).toBeGreaterThan(0.8);
    // Zoom controls.
    const zoomLabel = light.locator("span", { hasText: /^\d+%$/ }).last();
    const z0 = await zoomLabel.textContent();
    await light.getByRole("button", { name: "Zoom in" }).click();
    await expect(zoomLabel).not.toHaveText(z0!);
    const z1 = await zoomLabel.textContent();
    await light.getByRole("button", { name: "Zoom out" }).click();
    await light.getByRole("button", { name: "Zoom out" }).click();
    await expect(zoomLabel).not.toHaveText(z1!);
    await light.getByRole("button", { name: "Fit", exact: true }).click();
    await expect(zoomLabel).toHaveText(z0!);
    // Figures minimap (one figure).
    const rail = light.getByRole("navigation", { name: "Figures on this canvas" });
    await expect(rail).toBeVisible();
    await expect(rail.getByRole("button", { name: "Checkout flow" })).toHaveCount(1);
    const fitted = JSON.stringify(await pub.camera());
    await rail.getByRole("button", { name: "Checkout flow" }).click();
    // The camera moves to the figure.
    await expect.poll(async () => JSON.stringify(await pub.camera())).not.toBe(fitted);

    // Dark colour scheme.
    const dark = await (await anonContext({ colorScheme: "dark", viewport: { width: 1400, height: 900 } })).newPage();
    await dark.goto(`/pub/${slug}`);
    await new CanvasUi(dark).ready({ items: 3 });
    expect(await luminance(dark)).toBeLessThan(0.2);

    // Phone: the floating bar (votes · Figures · fit · share).
    const phone = await (await anonContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })).newPage();
    await phone.goto(`/pub/${slug}`);
    await new CanvasUi(phone).ready({ items: 3 });
    await expect(phone.getByRole("button", { name: "Show the whole canvas" })).toBeVisible();
    await expect(phone.getByRole("button", { name: "Share" })).toBeVisible();
    await phone.getByRole("button", { name: "Figures" }).click();
    await expect(phone.getByRole("navigation", { name: "Figures on this canvas" }).last()).toBeVisible();

    // Unpublish from the dialog → the public page is gone.
    await page.getByRole("button", { name: "Share" }).click();
    await page.getByRole("dialog").getByRole("switch", { name: "Publish to web" }).click();
    await expect.poll(async () => (await api.request("GET", `/canvas/${c.id}/publish`)).published).toBe(false);
    consoleProblems.allow(/404/);
    const gone = await light.goto(`/pub/${slug}`);
    expect(gone?.status()).toBe(404);
    await expect(light.locator(".occ-root")).toHaveCount(0);
  });

  test("anyone with the link can view /c/<id> signed out, read-only; restricted blocks it", async ({ api, anonContext, consoleProblems }) => {
    const c = await api.createCanvas(e2eTitle("link shared"));
    await api.updateCanvas(c.id, { document: DOC });
    await api.generalAccess("canvas", c.id, "anyone_with_link", "viewer");

    const anon = await (await anonContext()).newPage();
    const saves: string[] = [];
    anon.on("request", (r) => r.method() === "PATCH" && saves.push(r.url()));
    await anon.goto(`/c/${c.id}`);
    const ui = await new CanvasUi(anon).ready({ items: 3 });
    await expect(ui.rail()).toHaveCount(0);
    await expect(anon.getByText("View only")).toBeVisible();
    await expect(anon.getByRole("button", { name: "Rearrange", exact: true })).toHaveCount(0);
    // Trying to draw or delete does nothing.
    await ui.focus();
    await anon.keyboard.press("r");
    const p = await ui.at(200, 200);
    await ui.drag(p, { x: p.x + 120, y: p.y + 80 });
    const a = await ui.centerOf("a");
    await anon.mouse.click(a.x, a.y);
    await anon.keyboard.press("Delete");
    await expect(ui.items()).toHaveCount(3);
    await anon.waitForTimeout(2000);
    expect(saves).toEqual([]);
    expect((await api.getCanvas(c.id)).document.items).toHaveLength(3);

    await api.generalAccess("canvas", c.id, "restricted");
    consoleProblems.allow(/40[134]/);
    await anon.goto(`/c/${c.id}`);
    await expect(anon.locator(".occ-root")).toHaveCount(0);
  });
});

test.describe("published project and notebook pages render the canvas", () => {
  test("published project: Canvas view shows the project's canvas", async ({ api, anonContext }) => {
    const p = await api.createProject(e2eTitle("published project"));
    const { canvasId } = await api.getProject(p.id);
    await api.updateCanvas(canvasId, { document: DOC });
    const { publicSlug } = await api.publish("project", p.id);
    expect(publicSlug).toBeTruthy();

    const anon = await (await anonContext({ viewport: { width: 1400, height: 900 } })).newPage();
    await anon.goto(`/pub/${publicSlug}`);
    await anon.getByRole("radiogroup", { name: "View" }).first().getByRole("radio", { name: "Canvas" }).click();
    const ui = await new CanvasUi(anon, anon.getByRole("region", { name: "Canvas" })).ready({ items: 3 });
    await expect(ui.root.getByText("Published A")).toBeVisible();
    await anon.getByRole("radiogroup", { name: "View" }).first().getByRole("radio", { name: "Split" }).click();
    await expect(ui.root).toBeVisible();
  });

  test("published notebook: its canvas opens at /pub/<slug>/canvas/<id>", async ({ api, anonContext }) => {
    const nb = await api.createNotebook(e2eTitle("published notebook"));
    const title = e2eTitle("canvas in published notebook");
    const c = await api.createCanvas(title, { notebookId: nb.id });
    await api.updateCanvas(c.id, { document: DOC });
    const { publicSlug } = await api.publish("notebook", nb.id);

    const anon = await (await anonContext({ viewport: { width: 1400, height: 900 } })).newPage();
    await anon.goto(`/pub/${publicSlug}`);
    const card = anon.getByRole("link", { name: new RegExp(title) }).first();
    await expect(card).toBeVisible();
    await card.click();
    await anon.waitForURL(`**/pub/${publicSlug}/canvas/${c.id}`);
    const ui = await new CanvasUi(anon).ready({ items: 3 });
    await expect(ui.root.getByText("Published B")).toBeVisible();
    // Published via the notebook, not on its own.
    const state = await api.request("GET", `/canvas/${c.id}/publish`);
    expect(state.publishedVia).toMatchObject({ kind: "notebook", id: nb.id });
  });
});
