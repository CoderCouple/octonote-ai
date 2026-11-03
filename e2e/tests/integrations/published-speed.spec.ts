/** Published pages stay uncached so unpublishing is immediate; logins are checked locally. */
import { expect, test } from "../../helpers/fixtures";
import { API_URL } from "../../helpers/env";

test("published pages aren't cached, and a login is checked locally", async ({ api, session, request }) => {
  const note = await api.createNote(`Speed ${Date.now()}`, { markdown: "Hello." });
  const { publicSlug } = await api.publish("page", note.id);
  const res = await request.get(`/pub/${publicSlug}`);
  expect(res.ok()).toBe(true);
  expect(res.headers()["vercel-cdn-cache-control"]).toBeUndefined();
  await api.publish("page", note.id, false);
  // Unpublishing takes effect at once.
  expect((await request.get(`/pub/${publicSlug}`)).status()).toBe(404);

  const own = await request.get(`${API_URL}/pages/${note.id}`, { headers: { authorization: `Bearer ${session.accessToken}` } });
  expect(own.status()).toBe(200);
  // A tampered token is nobody: signed-in routes refuse it, and a private note stays hidden.
  const tampered = { authorization: `Bearer ${session.accessToken.slice(0, -4)}AAAA` };
  expect((await request.get(`${API_URL}/me`, { headers: tampered })).status()).toBe(401);
  expect((await request.get(`${API_URL}/pages/${note.id}`, { headers: tampered })).status()).toBe(404);
});

test("signed in, the app still opens; signed out, it asks you to sign in", async ({ page, enter, anonContext, api }) => {
  const note = await api.createNote(`Private ${Date.now()}`, { markdown: "Private words." });
  await enter(`/n/${note.id}`);
  await expect(page.getByText("Private words.")).toBeVisible();
  await page.goto("/workspace/home");
  await expect(page.getByRole("heading", { name: /Recent notes/ })).toBeVisible();

  // Asked without a browser: the local dev login page signs a browser in by itself.
  const signedOut = (await anonContext()).request;
  for (const path of ["/workspace/home", `/n/${note.id}`]) {
    const res = await signedOut.get(path, { maxRedirects: 0 });
    expect(res.status()).toBe(307);
    expect(res.headers().location).toContain("/login");
  }
});
