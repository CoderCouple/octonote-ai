import { readFileSync } from "node:fs";
import { CanvasUi, docOf, rect } from "../../helpers/canvas";
import { e2eTitle, expect, test } from "../../helpers/fixtures";

test("Export menu downloads PNG and SVG of the canvas", async ({ page, api, enter }, testInfo) => {
  const c = await api.createCanvas(e2eTitle("export"));
  await api.updateCanvas(c.id, { document: docOf([rect("a", 0, 0, { text: "Export me" }), rect("b", 260, 0, { text: "Too", color: "green" })]) });
  await enter(`/c/${c.id}`);
  const ui = await new CanvasUi(page).ready({ items: 2 });
  const corner = ui.root.locator(".occ-corner-right");

  for (const [item, ext] of [["PNG image", "png"], ["SVG vector", "svg"]] as const) {
    await corner.getByRole("button", { name: "Export" }).click();
    const menu = corner.getByRole("menu");
    await expect(menu.getByText("Whole canvas")).toBeVisible();
    const [download] = await Promise.all([page.waitForEvent("download"), menu.getByRole("menuitem", { name: item }).click()]);
    expect(download.suggestedFilename()).toMatch(new RegExp(`\\.${ext}$`));
    const file = testInfo.outputPath(`canvas.${ext}`);
    await download.saveAs(file);
    const bytes = readFileSync(file);
    if (ext === "png") expect(bytes.subarray(1, 4).toString()).toBe("PNG");
    else expect(bytes.toString("utf8")).toMatch(/<svg[\s\S]*Export me[\s\S]*<\/svg>/);
  }

  // Selection export says so.
  const a = await ui.centerOf("a");
  await page.mouse.click(a.x, a.y);
  await corner.getByRole("button", { name: "Export" }).click();
  await expect(corner.getByRole("menu").getByText("Selection")).toBeVisible();
  await page.keyboard.press("Escape");
});

test("v1 scope probe: comment / present / slides chrome on the canvas", async ({ page, api, enter }) => {
  // Reports (does not fail on) octodraw chrome that CLAUDE.md lists as v2:
  // comments are deferred; Export (PDF/PNG) is deferred too.
  const c = await api.createCanvas(e2eTitle("scope probe"));
  await api.updateCanvas(c.id, { document: docOf([{ id: "f", type: "figure", x: 0, y: 0, w: 320, h: 200, source: "A > B", autoSize: true }]) });
  await enter(`/c/${c.id}`);
  const ui = await new CanvasUi(page).ready({ items: 1 });
  const present = {
    commentTool: await ui.rail().getByRole("button", { name: "Comment", exact: true }).count(),
    exportMenu: await ui.root.locator(".occ-corner-right").getByRole("button", { name: "Export" }).count(),
    presentButton: await ui.root.getByRole("button", { name: "Present" }).count(),
    slidesButton: await ui.root.getByRole("button", { name: "Slides" }).count(),
  };
  test.info().annotations.push({ type: "v1-scope", description: JSON.stringify(present) });
  console.log("v1 scope probe:", JSON.stringify(present));
});
