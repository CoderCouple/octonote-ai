import { CanvasUi, ofType, waitForDoc } from "../../helpers/canvas";
import { e2eTitle, expect, test } from "../../helpers/fixtures";

// 24×16 red PNG.
const PNG_B64 =
  "iVBORw0KGgoAAAANSUhEUgAAABgAAAAQCAIAAACDRijCAAAAG0lEQVR4nGP4z8BAFcQwatCoQaMGjRo0rAwCAOxrTx9a5Z6hAAAAAElFTkSuQmCC";

test.describe("images on the canvas are uploaded to storage", () => {
  test("upload from the Insert palette stores a URL, not a data URL", async ({ page, api, enter }) => {
    const c = await api.createCanvas(e2eTitle("image upload"));
    await enter(`/c/${c.id}`);
    const ui = await new CanvasUi(page).ready({ items: 0 });
    await ui.focus();
    await page.keyboard.press("ControlOrMeta+k");
    const palette = page.getByRole("dialog", { name: "Insert" });
    const [chooser] = await Promise.all([
      page.waitForEvent("filechooser"),
      palette.getByRole("option", { name: "Image", exact: true }).click(),
    ]);
    await chooser.setFiles({ name: "red.png", mimeType: "image/png", buffer: Buffer.from(PNG_B64, "base64") });

    const saved = await waitForDoc(api, c.id, (d) => ofType(d, "image").length === 1, "image saved");
    const src = ofType(saved.document, "image")[0]!.src as string;
    expect(src).toMatch(/^https?:\/\//);
    expect(src).not.toMatch(/^data:/);
    expect(src).toContain(`/note-images/${c.id}/`);
    const res = await fetch(src);
    expect(res.status).toBe(200);
    await expect(ui.root.locator(`img[src="${src}"]`)).toBeVisible();
  });

  test("pasting an image file stores a URL", async ({ page, api, enter }) => {
    const c = await api.createCanvas(e2eTitle("image paste"));
    await enter(`/c/${c.id}`);
    const ui = await new CanvasUi(page).ready({ items: 0 });
    await ui.focus();
    await page.evaluate((b64) => {
      const bytes = Uint8Array.from(atob(b64), (ch) => ch.charCodeAt(0));
      const dt = new DataTransfer();
      dt.items.add(new File([bytes], "pasted.png", { type: "image/png" }));
      document.activeElement!.dispatchEvent(new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true }));
    }, PNG_B64);
    const saved = await waitForDoc(api, c.id, (d) => ofType(d, "image").length === 1, "pasted image saved");
    const src = ofType(saved.document, "image")[0]!.src as string;
    expect(src).toMatch(/^https?:\/\/.+\.png$/);
  });
});
