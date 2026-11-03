/** Report a bug with a screenshot from Home; staff read it in Admin → Feedback. */
import { API_URL } from "../../helpers/env";
import { expect, test } from "../../helpers/fixtures";

const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
  "base64",
);

test("a report from Home reaches Admin → Feedback, screenshot and details included", async ({ page, enter, session, request }) => {
  const message = `The canvas won't open ${Date.now()}`;
  await enter("/workspace/home");
  await page.getByRole("button", { name: "Report a bug" }).first().click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByText("What went wrong?")).toBeVisible();

  await dialog.getByRole("button", { name: "Request a feature" }).click();
  await expect(dialog.getByText("What would you like Octonote to do?")).toBeVisible();
  await dialog.getByRole("button", { name: "Report a bug" }).click();

  await dialog.getByRole("button", { name: "Send" }).click();
  await expect(dialog.getByRole("alert")).toHaveText("Write a few words first.");

  await dialog.getByLabel("What went wrong?").fill(message);
  await dialog.getByLabel("Choose a screenshot").setInputFiles({ name: "shot.png", mimeType: "image/png", buffer: PNG });
  await expect(dialog.getByAltText("Your screenshot")).toBeVisible();
  await dialog.getByRole("button", { name: "See what we attach" }).click();
  await expect(dialog.getByText("/workspace/home")).toBeVisible();
  await dialog.getByRole("button", { name: "Send" }).click();
  await expect(dialog.getByText("Thanks, we got it")).toBeVisible();
  await dialog.getByRole("button", { name: "Done" }).click();

  // The rest needs the dev user to be staff (users.is_admin).
  const admin = await request.get(`${API_URL}/admin/feedback`, {
    headers: { authorization: `Bearer ${session.accessToken}` },
  });
  test.skip(!admin.ok(), "The dev user isn't staff.");

  await page.goto("/admin/feedback");
  await page.getByRole("button", { name: new RegExp(message) }).click();
  const shot = page.getByAltText("Screenshot sent with this report");
  await expect(shot).toBeVisible();
  await expect.poll(() => shot.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(0);
  await expect(page.getByText("/workspace/home", { exact: true })).toBeVisible();

  await page.getByLabel("Status").click();
  await page.getByRole("option", { name: "Planned" }).click();
  await expect(page.getByText("Saved")).toBeVisible();
  await page.goto("/admin");
  await expect(page.getByRole("heading", { name: "Feedback" })).toBeVisible();
});

test("the account menu opens the form, and a link can ask for it", async ({ page, enter }) => {
  await enter("/workspace/home?feedback=feature");
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByText("What would you like Octonote to do?")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page).toHaveURL(/\/workspace\/home$/);
  await page.locator('[data-sidebar="footer"] button').last().click();
  await page.getByRole("menuitem", { name: "Request a feature" }).click();
  await expect(dialog.getByText("What would you like Octonote to do?")).toBeVisible();
  // The menu must hand over focus cleanly: the form is usable.
  await dialog.getByLabel("What would you like Octonote to do?").fill("It works");
  await expect(dialog.getByLabel("What would you like Octonote to do?")).toHaveValue("It works");
});
