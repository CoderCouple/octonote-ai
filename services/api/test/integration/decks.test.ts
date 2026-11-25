/**
 * Presentations: made empty or from a note, checked on every save, and shared
 * and published exactly like notes (a bug here leaks private slides).
 */
import { beforeEach, describe, expect, it } from "vitest";
import { markdownToNoteDocument } from "@octonote/content/server";
import { deckFromNote, heading, newSlide, paragraph } from "@octonote/slides/core";
import { createHarness, statusOf, type Harness } from "./harness";

let h: Harness;
let alice: Awaited<ReturnType<Harness["signIn"]>>;
let bob: Awaited<ReturnType<Harness["signIn"]>>;

beforeEach(async () => {
  h = await createHarness();
  alice = await h.signIn("alice@example.com");
  bob = await h.signIn("bob@example.com");
});

const view = (userId: string | null, id: string) => statusOf(h.permissions.require(userId, { kind: "deck", id }, "view"));
const slidesOf = (deck: { document: unknown }) => (deck.document as { slides: { layout: string }[] }).slides;

describe("making a presentation", () => {
  it("starts empty with a title slide, and lists with its slide count", async () => {
    const deck = await h.decks.create(alice.workspaceId, { title: "Attention" }, alice.id);
    expect(deck.id).toMatch(/^dck_/);
    expect(slidesOf(deck).map((s) => s.layout)).toEqual(["title"]);
    const list = await h.decks.list(alice.workspaceId, alice.id);
    expect(list.map((d) => [d.title, d.slideCount])).toEqual([["Attention", 1]]);
  });

  it("stores slides made from a note, in canonical form, and remembers the source", async () => {
    const note = await h.pages.create(alice.workspaceId, { title: "Attention" }, alice.id);
    const document = deckFromNote({ title: "Attention", blocks: [heading("Queries", 2), paragraph("q")] });
    // Extra keys and unknown settings are cleaned up on save.
    const deck = await h.decks.create(
      alice.workspaceId,
      { title: "Attention", document: { ...document, theme: "neon", junk: true }, source: { kind: "page", id: note.id, split: "heading" } },
      alice.id,
    );
    expect(deck.source).toEqual({ kind: "page", id: note.id, split: "heading" });
    expect(deck.document).toMatchObject({ version: 1, theme: "paper", slides: [{ layout: "title" }, { layout: "content" }] });
    expect(deck.document).not.toHaveProperty("junk");
  });

  it("refuses a malformed deck with the reason, and an oversized one", async () => {
    const s = newSlide();
    const bad = h.decks.create(alice.workspaceId, { title: "X", document: { version: 1, slides: [s, s] } }, alice.id);
    await expect(bad).rejects.toThrow(`repeats the id ${s.id}`);
    expect(await statusOf(bad)).toBe(400);
    const huge = { version: 1, slides: [newSlide("content", { notes: "x".repeat(9 * 1024 * 1024) })] };
    await expect(h.decks.create(alice.workspaceId, { title: "X", document: huge }, alice.id)).rejects.toThrow(/too large/);
  });

  it("won't record a source you can't open", async () => {
    const secret = await h.pages.create(alice.workspaceId, { title: "Secret" }, alice.id);
    const attempt = h.decks.create(bob.workspaceId, { title: "Copy", source: { kind: "page", id: secret.id, split: "heading" } }, bob.id);
    expect(await statusOf(attempt)).toBe(404);
  });
});

describe("editing", () => {
  it("saves title and slides; refuses an empty patch and a bad deck", async () => {
    const deck = await h.decks.create(alice.workspaceId, { title: "Draft" }, alice.id);
    const document = { version: 1, theme: "ink", aspect: "4:3", transition: "morph", slides: [newSlide("section", { main: [heading("Part 1", 1)] })] };
    const saved = await h.decks.update(deck.id, { title: "Final", document }, alice.id);
    expect(saved.title).toBe("Final");
    expect(saved.document).toMatchObject({ theme: "ink", aspect: "4:3", transition: "morph" });
    expect(await statusOf(h.decks.update(deck.id, { document: { version: 2, slides: [] } }, alice.id))).toBe(400);
  });

  it("moves into a notebook and out; deleted decks are gone", async () => {
    const nb = await h.notebooks.create(alice.workspaceId, { name: "Talks" }, alice.id);
    const deck = await h.decks.create(alice.workspaceId, { title: "Talk" }, alice.id);
    await h.decks.moveToNotebook(deck.id, nb.id, alice.id);
    const contents = await h.notebooks.getContents(nb.id, alice.id);
    expect(contents.decks.map((d) => d.id)).toEqual([deck.id]);
    await h.decks.softDelete(deck.id, alice.id);
    expect(await view(alice.id, deck.id)).toBe(404);
    expect((await h.notebooks.getContents(nb.id, alice.id)).decks).toEqual([]);
  });
});

describe("access", () => {
  it("is private by default: a stranger and a visitor get 404", async () => {
    const deck = await h.decks.create(alice.workspaceId, { title: "Private" }, alice.id);
    expect(await view(bob.id, deck.id)).toBe(404);
    expect(await view(null, deck.id)).toBe(404);
  });

  it("a viewer can watch but not edit; an editor can edit but not publish or delete", async () => {
    const deck = await h.decks.create(alice.workspaceId, { title: "Talk" }, alice.id);
    await h.shares.add({ resourceKind: "deck", resourceId: deck.id, email: bob.email, role: "viewer" }, alice);
    expect(await view(bob.id, deck.id)).toBe(200);
    expect(await statusOf(h.decks.update(deck.id, { title: "Mine" }, bob.id))).toBe(403);
    const share = (await h.shares.list("deck", deck.id, alice.id))[0]!;
    await h.shares.updateRole(share.share.id, "editor", alice.id);
    await h.decks.update(deck.id, { title: "Edited by Bob" }, bob.id);
    expect(await statusOf(h.settings.setPublished("deck", deck.id, true, bob.id))).toBe(403);
    expect(await statusOf(h.decks.softDelete(deck.id, bob.id))).toBe(403);
  });

  it("inherits access from its notebook", async () => {
    const nb = await h.notebooks.create(alice.workspaceId, { name: "Course" }, alice.id);
    const deck = await h.decks.create(alice.workspaceId, { title: "Week 1", notebookId: nb.id }, alice.id);
    await h.shares.add({ resourceKind: "notebook", resourceId: nb.id, email: bob.email, role: "viewer" }, alice);
    expect(await view(bob.id, deck.id)).toBe(200);
  });

  it("anyone with the link can watch while signed out, never edit", async () => {
    const deck = await h.decks.create(alice.workspaceId, { title: "Open" }, alice.id);
    await h.settings.setGeneralAccess("deck", deck.id, { linkAccess: "anyone_with_link", linkRole: "editor" }, alice.id);
    expect(await view(null, deck.id)).toBe(200);
    expect((await h.permissions.resolve(null, { kind: "deck", id: deck.id })).role).toBe("viewer");
  });
});

describe("publishing", () => {
  it("a published deck is readable by its slug, without the presenter's notes", async () => {
    const document = { version: 1, slides: [newSlide("title", { main: [heading("Hi", 1)], notes: "My private script" })] };
    const deck = await h.decks.create(alice.workspaceId, { title: "Attention from scratch", document }, alice.id);
    const state = await h.settings.setPublished("deck", deck.id, true, alice.id);
    expect(state.publicUrl).toMatch(/\/pub\/attention-from-scratch/);
    const view = await h.public.getBySlug(state.publicSlug!);
    expect(view.root).toMatchObject({ kind: "deck", id: deck.id, title: "Attention from scratch" });
    expect(view.resource).toMatchObject({ kind: "deck", title: "Attention from scratch", document: { version: 1, slides: [{ notes: "" }] } });
    expect(JSON.stringify(view)).not.toContain("My private script");
    await h.settings.setPublished("deck", deck.id, false, alice.id);
    expect(await statusOf(h.public.getBySlug(state.publicSlug!))).toBe(404);
  });

  it("a published notebook lists its decks and opens them; decks outside it stay hidden", async () => {
    const nb = await h.notebooks.create(alice.workspaceId, { name: "Course" }, alice.id);
    const inside = await h.decks.create(alice.workspaceId, { title: "Week 1", notebookId: nb.id }, alice.id);
    const outside = await h.decks.create(alice.workspaceId, { title: "Private" }, alice.id);
    const { publicSlug } = await h.settings.setPublished("notebook", nb.id, true, alice.id);
    const book = await h.public.getBySlug(publicSlug!);
    expect(book.resource.kind === "notebook" && book.resource.items).toEqual([
      expect.objectContaining({ kind: "deck", id: inside.id, title: "Week 1", slideCount: 1 }),
    ]);
    expect((await h.public.getChild(publicSlug!, "deck", inside.id)).resource.kind).toBe("deck");
    expect(await statusOf(h.public.getChild(publicSlug!, "deck", outside.id))).toBe(404);
    // Published via the notebook.
    expect((await h.settings.getPublishState("deck", inside.id, alice.id)).publishedVia).toMatchObject({ kind: "notebook", id: nb.id });
  });
});

describe("made on the server (CLI, agents)", () => {
  it("from slide markdown: --- between slides, ??? before notes, blocks checked like a note's", async () => {
    const markdown = [
      "# Attention",
      "How a transformer looks",
      "???",
      "Welcome.",
      "---",
      "## Check",
      "Answer first.",
      "```quiz",
      JSON.stringify({ questions: [{ id: "q1", prompt: "2+2?", options: [{ id: "a", text: "4" }, { id: "b", text: "5" }], correct: ["a"] }] }),
      "```",
    ].join("\n");
    const deck = await h.decks.create(alice.workspaceId, { title: "Talk", markdown }, alice.id);
    expect(slidesOf(deck).map((s) => s.layout)).toEqual(["title", "split"]);
    expect((deck.document as { slides: { notes: string }[] }).slides[0]!.notes).toBe("Welcome.");
    const bad = markdown.replace('"correct":["a"]', '"correct":["zzz"]');
    // Refused as an invalid block (422), the way a note written as markdown is.
    expect(await statusOf(h.decks.create(alice.workspaceId, { title: "Bad", markdown: bad }, alice.id))).toBe(422);
  });

  it("from a note: in the note's notebook, remembering it", async () => {
    const nb = await h.notebooks.create(alice.workspaceId, { name: "Course" }, alice.id);
    const note = await h.pages.create(alice.workspaceId, { title: "Attention", notebookId: nb.id }, alice.id);
    const document = await markdownToNoteDocument("Intro line.\n\n## Queries\n\n- q\n\n## Keys\n\nA long paragraph that becomes notes.");
    await h.pages.update(note.id, { document }, alice.id);
    const deck = await h.decks.createFromSource(alice.workspaceId, { source: { kind: "page", id: note.id, split: "heading" }, textToNotes: true, onePerSlide: true }, alice.id);
    expect(deck).toMatchObject({ title: "Attention", notebookId: nb.id, source: { kind: "page", id: note.id } });
    expect(slidesOf(deck).map((s) => s.layout)).toEqual(["title", "content", "content"]);
  });

  it("from a project: note slides, then its canvas, copied into the deck", async () => {
    const { project, canvasId } = await h.projects.create(alice.workspaceId, { name: "Transformer" }, alice.id);
    const pair = { canvasId };
    await h.canvasDiagrams.replace(canvasId, "graph TD\n  A[Input] --> B[Attention]", undefined, alice.id);
    const deck = await h.decks.createFromSource(alice.workspaceId, { source: { kind: "project", id: project.id, split: "heading" }, textToNotes: true, onePerSlide: true }, alice.id);
    const doc = deck.document as { slides: { layout: string; canvas?: { canvasId: string } }[]; canvases?: Record<string, unknown> };
    expect(doc.slides.at(-1)).toMatchObject({ layout: "canvas", canvas: { canvasId: pair.canvasId } });
    expect(Object.keys(doc.canvases ?? {})).toEqual([pair.canvasId]);
  });

  it("from a notebook: a section per item, by name", async () => {
    const nb = await h.notebooks.create(alice.workspaceId, { name: "Course" }, alice.id);
    await h.pages.create(alice.workspaceId, { title: "Week 2", notebookId: nb.id }, alice.id);
    await h.pages.create(alice.workspaceId, { title: "Week 10", notebookId: nb.id }, alice.id);
    const deck = await h.decks.createFromSource(alice.workspaceId, { source: { kind: "notebook", id: nb.id, split: "heading" }, textToNotes: true, onePerSlide: true }, alice.id);
    expect(deck.notebookId).toBe(nb.id);
    const titles = (deck.document as { slides: { layout: string; main: { content?: { text: string }[] }[] }[] }).slides.map((s) => s.main[0]?.content?.[0]?.text);
    expect(titles).toEqual(["Course", "Week 2", "Week 10"]);
  });

  it("only from something you can open", async () => {
    const secret = await h.pages.create(alice.workspaceId, { title: "Secret" }, alice.id);
    const attempt = h.decks.createFromSource(bob.workspaceId, { source: { kind: "page", id: secret.id, split: "heading" }, textToNotes: true, onePerSlide: true }, bob.id);
    expect(await statusOf(attempt)).toBe(404);
  });
});

describe("Let AI design it", () => {
  it("builds the model's plan with the note's own blocks, as the source's copy", async () => {
    const note = await h.pages.create(alice.workspaceId, { title: "Attention" }, alice.id);
    const quiz = '```quiz\n{"questions":[{"id":"q1","prompt":"2+2?","options":[{"id":"a","text":"4"},{"id":"b","text":"5"}],"correct":["a"]}]}\n```';
    await h.pages.update(note.id, { document: await markdownToNoteDocument(`## Scaling\n\nDot products grow with dimension.\n\n${quiz}`) }, alice.id);
    // The model is replaced: it sees the brief and answers with a plan.
    const ai = (h.decks as unknown as { interactive: { assertReady: () => Promise<void>; designSlides: (...a: unknown[]) => Promise<unknown> } }).interactive;
    let brief = "";
    ai.assertReady = async () => {};
    ai.designSlides = async (_user, b) => {
      brief = (b as { text: string }).text;
      return {
        slides: [
          { layout: "title", title: "Attention", points: ["Why we scale"] },
          { layout: "split", title: "Check", points: ["Answer first"], refs: ["B1"], notes: "Give them a minute." },
        ],
      };
    };
    const deck = await h.decks.createFromSource(alice.workspaceId, { source: { kind: "page", id: note.id, split: "heading" }, textToNotes: true, onePerSlide: true, design: "ai" }, alice.id);
    expect(brief).toContain("[B1: quiz]");
    const slides = (deck.document as { slides: { layout: string; side: { type: string }[]; notes: string }[] }).slides;
    expect(slides.map((s) => s.layout)).toEqual(["title", "split"]);
    expect(slides[1]!.side[0]!.type).toBe("interactive");
    expect(slides[1]!.notes).toBe("Give them a minute.");
    expect(deck.source).toEqual({ kind: "page", id: note.id, split: "heading" });
  });
});
