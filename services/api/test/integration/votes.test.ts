/**
 * Published pages: a byline (author name, publish date — never emails or ids)
 * and up/down votes from signed-in readers, only on published content.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { createHarness, statusOf, type Harness } from "./harness";

let h: Harness;
let alice: Awaited<ReturnType<Harness["signIn"]>>;
let bob: Awaited<ReturnType<Harness["signIn"]>>;
let carol: Awaited<ReturnType<Harness["signIn"]>>;

beforeEach(async () => {
  h = await createHarness();
  alice = await h.signIn("alice@example.com");
  bob = await h.signIn("bob@example.com");
  carol = await h.signIn("carol@example.com");
});

async function publishedNote() {
  const note = await h.pages.create(alice.workspaceId, { title: "Rate limiter" }, alice.id);
  await h.settings.setPublished("page", note.id, true, alice.id);
  return { note, slug: await slugOf(note.id) };
}

async function slugOf(id: string) {
  const [row] = await h.db.query.pages.findMany({ where: (p, { eq }) => eq(p.id, id), limit: 1 });
  return row!.publicSlug!;
}

describe("published byline", () => {
  it("never shows an email-derived name; a name set in Settings shows and survives sign-in", async () => {
    const { slug } = await publishedNote();
    // alice@example.com signed in without a name, so she's "alice" — not published.
    expect((await h.public.getBySlug(slug)).byline.author?.name).toBeNull();

    await h.me.updateName(alice.id, "  Alice   Smith ");
    expect((await h.public.getBySlug(slug)).byline.author?.name).toBe("Alice Smith");
    // Signing in again must not reset it to the provider/email name.
    await h.me.sync({
      id: alice.id,
      email: alice.email,
      user_metadata: { name: "alice" },
      app_metadata: {},
      aud: "authenticated",
      created_at: new Date().toISOString(),
    } as never);
    expect((await h.public.getBySlug(slug)).byline.author?.name).toBe("Alice Smith");
  });

  it("fills in a real provider name over the email placeholder", async () => {
    const { slug } = await publishedNote();
    await h.me.sync({
      id: alice.id,
      email: alice.email,
      user_metadata: { full_name: "Alice Google" },
      app_metadata: {},
      aud: "authenticated",
      created_at: new Date().toISOString(),
    } as never);
    expect((await h.public.getBySlug(slug)).byline.author?.name).toBe("Alice Google");
  });

  it("names the author and the publish date, without emails or ids", async () => {
    const { slug } = await publishedNote();
    await h.me.updateName(alice.id, "Alice Smith");
    const view = await h.public.getBySlug(slug);
    expect(view.byline.author?.name).toBe("Alice Smith");
    expect(view.byline.publishedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    const json = JSON.stringify(view);
    expect(json).not.toContain(alice.email);
    expect(json).not.toContain(alice.id);
  });
});

describe("votes", () => {
  it("shows counts to everyone; voting needs a signed-in reader", async () => {
    const { note, slug } = await publishedNote();
    expect(await h.votes.summary(slug, "page", note.id, null)).toEqual({ up: 0, down: 0, mine: 0 });
    expect(await statusOf(h.votes.vote(slug, "page", note.id, null, 1))).toBe(401);
  });

  it("gives each reader one vote they can change or remove", async () => {
    const { note, slug } = await publishedNote();
    expect(await h.votes.vote(slug, "page", note.id, bob.id, 1)).toEqual({ up: 1, down: 0, mine: 1 });
    await h.votes.vote(slug, "page", note.id, bob.id, 1); // twice still counts once
    expect(await h.votes.vote(slug, "page", note.id, carol.id, -1)).toEqual({ up: 1, down: 1, mine: -1 });
    expect(await h.votes.vote(slug, "page", note.id, bob.id, -1)).toEqual({ up: 0, down: 2, mine: -1 });
    expect(await h.votes.vote(slug, "page", note.id, bob.id, 0)).toEqual({ up: 0, down: 1, mine: 0 });
    // Signed out sees totals only.
    expect(await h.votes.summary(slug, "page", note.id, null)).toEqual({ up: 0, down: 1, mine: 0 });
  });

  it("only works on published content under that slug", async () => {
    const { slug } = await publishedNote();
    const secret = await h.pages.create(alice.workspaceId, { title: "Private" }, alice.id);
    expect(await statusOf(h.votes.vote(slug, "page", secret.id, bob.id, 1))).toBe(404);
    expect(await statusOf(h.votes.summary(slug, "page", secret.id, null))).toBe(404);
    expect(await statusOf(h.votes.summary("no-such-slug", "page", secret.id, null))).toBe(404);
  });

  it("works on items inside a published notebook", async () => {
    const nb = await h.notebooks.create(alice.workspaceId, { name: "Guides" }, alice.id);
    const inside = await h.pages.create(alice.workspaceId, { title: "Inside", notebookId: nb.id }, alice.id);
    await h.settings.setPublished("notebook", nb.id, true, alice.id);
    const view = await h.public.getBySlug(
      (await h.db.query.notebooks.findFirst({ where: (n, { eq }) => eq(n.id, nb.id) }))!.publicSlug!,
    );
    expect((await h.votes.vote(view.root.slug, "page", inside.id, bob.id, 1)).up).toBe(1);
  });
});
