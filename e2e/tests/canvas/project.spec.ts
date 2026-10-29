import { CanvasUi, docOf, ofType, rect, waitForDoc } from "../../helpers/canvas";
import { e2eTitle, expect, test } from "../../helpers/fixtures";

test.describe("project: note + canvas", () => {
  test("split view shows both side by side; switching views keeps the canvas; canvas edits save", async ({ page, api, enter }) => {
    const p = await api.createProject(e2eTitle("project"));
    const { noteId, canvasId } = await api.getProject(p.id);
    expect(noteId).toBeTruthy();
    expect(canvasId).toBeTruthy();
    await api.updateCanvas(canvasId, { document: docOf([rect("a", 0, 0, { text: "In project" })]) });

    await enter(`/p/${p.id}?view=split`);
    const ui = await new CanvasUi(page).ready({ items: 1 });
    const editor = page.locator(".bn-editor").first();
    await expect(editor).toBeVisible();
    const [nb, cb] = [(await editor.boundingBox())!, (await ui.root.boundingBox())!];
    expect(nb.x + nb.width).toBeLessThanOrEqual(cb.x + 2);
    // Side by side: the panes overlap vertically.
    expect(nb.y).toBeLessThan(cb.y + cb.height);
    expect(cb.y).toBeLessThan(nb.y + nb.height);

    const layout = page.getByLabel("Layout");
    await layout.getByLabel("Note only", { exact: true }).click();
    await expect(ui.root).toBeHidden();
    await expect(editor).toBeVisible();
    await layout.getByLabel("Canvas only", { exact: true }).click();
    await expect(editor).toBeHidden();
    await expect(ui.root).toBeVisible();
    // Canvas-only gives the canvas the full width.
    expect((await ui.root.boundingBox())!.width).toBeGreaterThan(cb.width * 1.5);

    await ui.draw("Ellipse", [300, 150], [450, 240]);
    await waitForDoc(api, canvasId, (d) => d.items.length === 2, "project canvas edit saved");

    // Back to split: the canvas pane stayed mounted with the edit.
    await layout.getByLabel("Note and canvas together", { exact: true }).click();
    await expect(editor).toBeVisible();
    await expect(ui.items()).toHaveCount(2);

    // The note still edits beside it.
    await editor.click();
    await page.keyboard.type("Typed beside the canvas");
    await expect.poll(async () => JSON.stringify((await api.getNote(noteId)).document), { timeout: 20_000 }).toContain("Typed beside the canvas");
  });

  test("dragging a selected figure from the canvas into the note embeds it (canvas unchanged)", async ({ page, api, enter }) => {
    const p = await api.createProject(e2eTitle("project figure"));
    const { noteId, canvasId } = await api.getProject(p.id);
    const figure = { id: "fig1", type: "figure", x: 0, y: 0, w: 320, h: 200, source: "title Login flow\nUser > Login > Dashboard", autoSize: true };
    await api.updateCanvas(canvasId, { document: docOf([figure]) });

    await enter(`/p/${p.id}?view=split`);
    const ui = await new CanvasUi(page).ready({ items: 1 });
    // The figure's PNG must be synced before a note can embed it.
    await expect.poll(async () => (await api.listCanvasFigures(canvasId)).filter((f) => f.imageUrl).length, { timeout: 30_000 }).toBe(1);
    const before = (await api.getCanvas(canvasId)).document.items[0]!;

    const fc = await ui.centerOf("fig1");
    await page.mouse.click(fc.x, fc.y);
    await expect(ui.selbar()).toBeVisible();
    const zone = page.locator("[data-figure-drop-zone]").first();
    const zb = (await zone.boundingBox())!;
    await ui.drag(fc, { x: zb.x + zb.width / 2, y: zb.y + 80 }, 20);

    await expect(page.locator(".bn-editor img").first()).toBeVisible();
    await expect
      .poll(async () => JSON.stringify((await api.getNote(noteId)).document), { timeout: 20_000 })
      .toMatch(/"type":"figure"/);
    // The figure stays where it was on the canvas.
    await page.waitForTimeout(2000);
    const after = (await api.getCanvas(canvasId)).document;
    expect(ofType(after, "figure")).toHaveLength(1);
    expect(ofType(after, "figure")[0]).toMatchObject({ x: before.x, y: before.y });
  });
});
