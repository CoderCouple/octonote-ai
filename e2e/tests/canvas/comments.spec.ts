import { CanvasUi, docOf, rect, waitForDoc } from "../../helpers/canvas";
import { e2eTitle, expect, test } from "../../helpers/fixtures";

type Thread = { messages: { author: { id: string; name: string }; text: string }[] };

test("a comment is saved under the signed-in person's name, on a canvas and in a project", async ({ page, api, enter }) => {
  const { user } = await api.request<{ user: { id: string; name: string; email: string } }>("GET", "/me");
  const name = user.name.trim() || user.email.split("@")[0]!;

  const c = await api.createCanvas(e2eTitle("comments"));
  const p = await api.createProject(e2eTitle("comments project"));

  for (const [path, canvasId] of [
    [`/c/${c.id}`, c.id],
    [`/p/${p.id}?view=canvas`, p.canvasId as string],
  ] as const) {
    // One shape, so the empty-canvas template picker doesn't take the click.
    await api.updateCanvas(canvasId, { document: docOf([rect("a", 0, 0)]) });
    await enter(path);
    const ui = await new CanvasUi(page).ready({ items: 1 });
    await ui.tool("Comment");
    const at = await ui.at(300, 200);
    await page.mouse.click(at.x, at.y);
    const box = page.getByRole("dialog", { name: "Comment thread" }).locator("textarea");
    await box.fill("Looks good");
    await box.press("Enter");

    const saved = await waitForDoc(api, canvasId, (d) => ((d as { comments?: Thread[] }).comments ?? []).length === 1, "comment saved");
    const [thread] = (saved.document as { comments: Thread[] }).comments;
    expect(thread!.messages[0]).toMatchObject({ author: { id: user.id, name }, text: "Looks good" });
    // The pin names the author too.
    await expect(ui.root.getByRole("button", { name: `Comment by ${name}` })).toBeVisible();
  }
});
