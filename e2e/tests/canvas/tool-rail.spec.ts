import { CanvasUi, docOf, ofType, rect, waitForDoc } from "../../helpers/canvas";
import { e2eTitle, expect, test } from "../../helpers/fixtures";

test("tool rail: tooltips, Figure tool, Icon page, and the selection menu docked at the bottom", async ({ page, api, enter }) => {
  const c = await api.createCanvas(e2eTitle("tool rail"));
  await api.updateCanvas(c.id, { document: docOf([rect("s1", 0, 0, { text: "Box" }), rect("s2", 1400, 900)]) });
  await enter(`/c/${c.id}`);
  const ui = await new CanvasUi(page).ready({ items: 2 });
  const root = await ui.rootBox();

  // The rail starts at the top left; hovering a tool shows its name and key.
  const insert = ui.rail().getByRole("button", { name: "Insert", exact: true });
  const ib = (await insert.boundingBox())!;
  expect(ib.y - root.y).toBeLessThan(40);
  expect(ib.x - root.x).toBeLessThan(40);
  await ui.rail().getByRole("button", { name: "Rectangle", exact: true }).hover();
  await expect(ui.root.getByRole("tooltip")).toHaveText(/Rectangle\s*R/);

  // + opens the panel beside the rail and turns into ×; pressing it again closes it.
  await insert.click();
  const palette = page.getByRole("dialog", { name: "Insert" });
  await expect(palette).toBeVisible();
  await expect(palette.getByRole("option", { name: /^Diagram as Code/ })).toBeVisible();
  await ui.rail().getByRole("button", { name: "Close", exact: true }).click();
  await expect(palette).toHaveCount(0);

  // Selecting an item docks its menu at the bottom centre.
  await ui.item("s1").click();
  const bar = (await ui.selbar().boundingBox())!;
  expect(Math.abs(bar.x + bar.width / 2 - (root.x + root.width / 2))).toBeLessThan(4);
  expect(root.y + root.height - (bar.y + bar.height)).toBeLessThan(40);
  await page.keyboard.press("Escape");

  // F, then drag: an empty figure in that box.
  await ui.focus();
  await page.keyboard.press("f");
  const from = await ui.at(root.width - 420, 120);
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(from.x + 200, from.y + 150, { steps: 6 });
  await page.mouse.up();
  await waitForDoc(api, c.id, (d) => ofType(d, "figure").some((f) => f.source === "" && (f.w as number) > 150), "empty figure saved");

  // I opens the Icon page; search and Enter inserts it.
  await page.keyboard.press("Escape");
  await ui.focus();
  await page.keyboard.press("i");
  await expect(palette.getByRole("listbox", { name: "Icon" })).toBeVisible();
  await page.keyboard.type("database");
  await page.keyboard.press("Enter");
  await waitForDoc(api, c.id, (d) => ofType(d, "icon").length === 1, "icon saved");
  await page.screenshot({ path: test.info().outputPath("tool-rail.png") });
});
