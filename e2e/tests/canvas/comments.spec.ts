import { CanvasUi, docOf, rect, waitForDoc } from "../../helpers/canvas";
import { e2eTitle, expect, test } from "../../helpers/fixtures";
import { call, otherClient } from "../integrations/_support";

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
    const [thread] = (saved.document as unknown as { comments: Thread[] }).comments;
    expect(thread!.messages[0]).toMatchObject({ author: { id: user.id, name }, text: "Looks good" });
    // The pin names the author too.
    await expect(ui.root.getByRole("button", { name: `Comment by ${name}` })).toBeVisible();
  }
});

test("@ suggests people the canvas is shared with and keeps the mention", async ({ page, api, enter }) => {
  const other = await otherClient();
  const { result: who } = await call<{ user: { name: string } }>("GET", "/me", undefined, other.token);
  const c = await api.createCanvas(e2eTitle("mentions"));
  await api.updateCanvas(c.id, { document: docOf([rect("a", 0, 0)]) });
  await api.request("POST", "/shares", { resourceKind: "canvas", resourceId: c.id, email: other.email, role: "editor" });

  await enter(`/c/${c.id}`);
  const ui = await new CanvasUi(page).ready({ items: 1 });
  await ui.tool("Comment");
  const at = await ui.at(300, 200);
  await page.mouse.click(at.x, at.y);
  const thread = page.getByRole("dialog", { name: "Comment thread" });
  const box = thread.locator("textarea");
  await expect(box).toHaveAttribute("placeholder", /@ to mention/);
  await box.pressSequentially("Can you check this @E2E");
  const picker = page.getByRole("listbox", { name: "Mention someone" });
  await expect(picker.getByText(who.user.name)).toBeVisible();
  await box.press("Enter");
  await expect(box).toHaveValue(`Can you check this @${who.user.name} `);
  await box.press("Enter");

  const saved = await waitForDoc(api, c.id, (d) => ((d as { comments?: Thread[] }).comments ?? []).length === 1, "comment saved");
  expect((saved.document as unknown as { comments: Thread[] }).comments[0]!.messages[0]!.text).toBe(`Can you check this @${who.user.name}`);
});
