import { devices } from "@playwright/test";
import { CanvasUi, docOf, rect, shapes, waitForDoc } from "../../helpers/canvas";
import { e2eTitle, expect, test } from "../../helpers/fixtures";
import { API_URL } from "../../helpers/env";

const iPhone = devices["iPhone 15"] ?? devices["iPhone 13"]!;

test.use({
  viewport: iPhone.viewport,
  deviceScaleFactor: iPhone.deviceScaleFactor,
  isMobile: true,
  hasTouch: true,
  // The native app's WebView appends OctonoteApp to the user agent.
  userAgent: `${iPhone.userAgent} OctonoteApp/1.0`,
});

test("in the app WebView (/embed/enter + OctonoteApp UA) the canvas hides duplicate chrome and stays editable", async ({ page, api, enter }) => {
  const c = await api.createCanvas(e2eTitle("webview"));
  await api.updateCanvas(c.id, { document: docOf([rect("a", 0, 0, { text: "Phone" })]) });
  const clientHeaders: string[] = [];
  page.on("request", (r) => {
    if (r.url().startsWith(`${API_URL}/`)) clientHeaders.push(r.headers()["x-octonote-client"] ?? "");
  });

  await enter(`/c/${c.id}`);
  const ui = await new CanvasUi(page).ready({ items: 1 });
  // The native header owns back/home.
  await expect(page.getByRole("link", { name: "Back" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Octonote AI home" })).toHaveCount(0);
  // Editor chrome is still there; the tool rail moves to the bottom on narrow panes.
  await expect(ui.rail()).toBeVisible();
  const rail = (await ui.rail().boundingBox())!;
  const root = (await ui.root.boundingBox())!;
  expect(rail.y).toBeGreaterThan(root.y + root.height / 2);
  await expect(page.getByRole("button", { name: "Share" })).toBeVisible();

  // Still editable: draw a rectangle.
  await ui.tool("Rectangle");
  const p = await ui.at(60, 120);
  await ui.drag(p, { x: p.x + 120, y: p.y + 70 });
  await waitForDoc(api, c.id, (d) => shapes(d).length === 2, "drawn in the WebView");
  // Client-side API calls identify as the mobile app.
  expect(clientHeaders.filter(Boolean)).toContain("mobile");
});
