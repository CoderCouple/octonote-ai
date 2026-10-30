import { CanvasUi, docOf, ofType, rect, shapes, waitForDoc } from "../../helpers/canvas";
import { e2eTitle, expect, test } from "../../helpers/fixtures";

const MOD = "ControlOrMeta";

test.describe("canvas tools", () => {
  test("rectangle, ellipse, diamond, sticky, text and pen", async ({ page, api, enter }) => {
    const c = await api.createCanvas(e2eTitle("tools"));
    await enter(`/c/${c.id}`);
    const ui = await new CanvasUi(page).ready({ items: 0 });

    await ui.draw("Rectangle", [260, 140], [420, 220]);
    await ui.draw("Ellipse", [480, 140], [640, 220]);
    await expect(ui.items()).toHaveCount(2);
    // Drawing a shape hands back the Select tool.
    await expect(ui.rail().getByRole("button", { name: "Select", exact: true })).toHaveAttribute("aria-pressed", "true");
    // Diamonds are under + › Shape.
    await ui.rail().getByRole("button", { name: "Insert", exact: true }).click();
    const palette = page.getByRole("dialog", { name: "Insert" });
    await palette.getByRole("option", { name: /^Shape/ }).click();
    await palette.getByRole("option", { name: /^Diamond/ }).click();
    await expect(palette).toHaveCount(0);
    await page.keyboard.press("Escape");
    await expect(ui.items()).toHaveCount(3);

    // S still picks the sticky note (it isn't on the rail any more).
    await ui.focus();
    await page.keyboard.press("s");
    await page.mouse.click(...Object.values(await ui.at(320, 420)) as [number, number]);
    await page.keyboard.type("Sticky E2E");
    await page.keyboard.press("Escape");

    await ui.tool("Text");
    await page.mouse.click(...Object.values(await ui.at(620, 420)) as [number, number]);
    await page.keyboard.type("Hello text");
    await page.keyboard.press("Escape");

    await ui.tool("Pen");
    const m = page.mouse;
    const p0 = await ui.at(820, 380);
    await m.move(p0.x, p0.y);
    await m.down();
    for (let i = 1; i <= 12; i++) await m.move(p0.x + i * 8, p0.y + Math.sin(i / 2) * 30);
    await m.up();

    await expect(ui.items()).toHaveCount(6);
    const saved = await waitForDoc(api, c.id, (d) => d.items.length === 6, "6 items saved");
    const doc = saved.document;
    expect(shapes(doc, "rectangle")).toHaveLength(1);
    expect(shapes(doc, "ellipse")).toHaveLength(1);
    expect(shapes(doc, "diamond")).toHaveLength(1);
    expect(ofType(doc, "sticky")[0]).toMatchObject({ text: "Sticky E2E" });
    expect(ofType(doc, "text")[0]).toMatchObject({ text: "Hello text" });
    const pen = ofType(doc, "pen")[0]!;
    expect(pen.points.length).toBeGreaterThan(5);
    // Pen points are normalised to the box.
    for (const v of (pen.points as number[][]).flat()) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
    const r = shapes(doc, "rectangle")[0]!;
    expect(r.w).toBeGreaterThan(100);
    expect(r.h).toBeGreaterThan(50);
  });

  test("arrow and line attach to the shapes they connect, and follow a moved shape", async ({ page, api, enter }) => {
    const c = await api.createCanvas(e2eTitle("arrow"));
    await api.updateCanvas(c.id, { document: docOf([rect("a", 0, 0, { text: "A" }), rect("b", 400, 0, { text: "B" }), rect("c", 0, 260, { text: "C" })]) });
    await enter(`/c/${c.id}`);
    const ui = await new CanvasUi(page).ready({ items: 3 });

    await ui.tool("Arrow");
    await ui.drag(await ui.centerOf("a"), await ui.centerOf("b"));
    await ui.tool("Line");
    await ui.drag(await ui.centerOf("a"), await ui.centerOf("c"));

    const saved = await waitForDoc(api, c.id, (d) => ofType(d, "line").length === 2, "two lines saved");
    const lines = ofType(saved.document, "line");
    const arrow = lines.find((l) => l.end.item === "b")!;
    const line = lines.find((l) => l.end.item === "c")!;
    expect(arrow).toMatchObject({ start: { item: "a" }, end: { item: "b" }, endArrow: true });
    expect(line).toMatchObject({ start: { item: "a" }, end: { item: "c" } });
    expect(line.endArrow ?? false).toBe(false);

    // Move B down: the arrow stays attached and its end follows.
    const before = arrow.end;
    const b = await ui.centerOf("b");
    await ui.drag(b, { x: b.x, y: b.y + 120 });
    const moved = await waitForDoc(api, c.id, (d) => (d.items.find((i) => i.id === "b")?.y ?? 0) > 40, "B moved");
    const arrow2 = ofType(moved.document, "line").find((l) => l.id === arrow.id)!;
    expect(arrow2.end.item).toBe("b");
    expect(arrow2.end.y).toBeGreaterThan(before.y + 40);
  });

  test("select, move, resize, rotate, duplicate, delete, undo/redo and shortcuts", async ({ page, api, enter }) => {
    const c = await api.createCanvas(e2eTitle("edit"));
    await api.updateCanvas(c.id, { document: docOf([rect("a", 0, 0, { text: "A" }), rect("b", 300, 200)]) });
    await enter(`/c/${c.id}`);
    const ui = await new CanvasUi(page).ready({ items: 2 });
    const get = async (id: string) => (await api.getCanvas(c.id)).document.items.find((i) => i.id === id);

    // Select + move.
    const a = await ui.centerOf("a");
    await page.mouse.click(a.x, a.y);
    await expect(ui.selbar()).toBeVisible();
    const { k } = await ui.camera();
    await ui.drag(a, { x: a.x + 100, y: a.y + 50 });
    await waitForDoc(api, c.id, (d) => Math.abs(d.items[0]!.x - 100 / k) < 6 && Math.abs(d.items[0]!.y - 50 / k) < 6, "A moved by the drag");

    // Resize from the south-east handle.
    const se = ui.root.locator('.occ-handle-se[data-for="a"]');
    const seBox = (await se.boundingBox())!;
    await ui.drag({ x: seBox.x + seBox.width / 2, y: seBox.y + seBox.height / 2 }, { x: seBox.x + 80, y: seBox.y + 40 });
    await waitForDoc(api, c.id, (d) => d.items[0]!.w > 160 + 40 / k && d.items[0]!.h > 80 + 20 / k, "A resized");

    // Rotate with the round handle: drag it to the right of the centre (≈90°).
    const rot = ui.root.locator('.occ-handle-rotate[data-for="a"]');
    const rotBox = (await rot.boundingBox())!;
    const center = await ui.centerOf("a");
    await ui.drag({ x: rotBox.x + rotBox.width / 2, y: rotBox.y + rotBox.height / 2 }, { x: center.x + 200, y: center.y });
    const rotated = await waitForDoc(api, c.id, (d) => Math.abs((d.items[0]!.rotation ?? 0) - 90) < 2, "A rotated 90°");
    expect(rotated.document.items[0]!.rotation).toBeCloseTo(90, 0);

    // Duplicate (⌘D), delete (⌫), undo (⌘Z), redo (⇧⌘Z).
    await page.keyboard.press(`${MOD}+d`);
    await expect(ui.items()).toHaveCount(3);
    await waitForDoc(api, c.id, (d) => d.items.length === 3, "duplicate saved");
    await page.keyboard.press("Delete");
    await expect(ui.items()).toHaveCount(2);
    await page.keyboard.press(`${MOD}+z`);
    await expect(ui.items()).toHaveCount(3);
    await page.keyboard.press(`Shift+${MOD}+z`);
    await expect(ui.items()).toHaveCount(2);
    // The corner Undo / Redo buttons do the same.
    await ui.root.getByRole("button", { name: "Undo", exact: true }).click();
    await expect(ui.items()).toHaveCount(3);
    await ui.root.getByRole("button", { name: "Redo", exact: true }).click();
    await expect(ui.items()).toHaveCount(2);
    await waitForDoc(api, c.id, (d) => d.items.length === 2, "redo saved");

    // Selection bar ⋯ More → Duplicate / Delete.
    const b = await ui.centerOf("b");
    await page.mouse.click(b.x, b.y);
    await ui.selbar().getByRole("button", { name: "More" }).click();
    await page.getByRole("menuitem", { name: /^Duplicate/ }).click();
    await expect(ui.items()).toHaveCount(3);
    await ui.selbar().getByRole("button", { name: "More" }).click();
    await page.getByRole("menuitem", { name: /^Delete/ }).click();
    await expect(ui.items()).toHaveCount(2);

    // Arrow keys nudge the selection.
    await page.mouse.click(b.x, b.y);
    const bx = (await get("b"))!.x;
    await page.keyboard.press("ArrowRight");
    await page.keyboard.press("ArrowRight");
    await waitForDoc(api, c.id, (d) => d.items.find((i) => i.id === "b")!.x > bx, "B nudged right");

    // ⌘A selects all; Escape clears.
    await page.keyboard.press(`${MOD}+a`);
    await expect(ui.root.locator('.occ-overlay rect[stroke-dasharray]')).toHaveCount(1);
    await page.keyboard.press("Escape");
    await expect(ui.selbar()).toHaveCount(0);

    // Tool shortcuts.
    for (const [key, label] of [["r", "Rectangle"], ["o", "Ellipse"], ["d", "Pen"], ["a", "Arrow"], ["l", "Line"], ["p", "Pen"], ["t", "Text"], ["f", "Figure"], ["c", "Comment"], ["v", "Select"]] as const) {
      await page.keyboard.press(key);
      await expect(ui.rail().getByRole("button", { name: label, exact: true })).toHaveAttribute("aria-pressed", "true");
    }
    // Zoom shortcuts change the zoom label.
    const zoom = ui.root.locator(".occ-zoom");
    const z0 = await zoom.textContent();
    await page.keyboard.press(`${MOD}+=`);
    await expect(zoom).not.toHaveText(z0!);
  });
});
