/**
 * Comments from the assistant-app card: a reader selects part of a note and
 * asks for a change; the assistant reads it and replaces exactly that part.
 * Edits never reach beyond the selection, stale reads are refused, other
 * comments follow the text they pointed at, and only editors can do any of it.
 */
import { noteDocumentToAnchoredHtml } from "@octonote/content/server";
import { beforeEach, describe, expect, it } from "vitest";
import { MAX_OPEN_COMMENTS } from "../../src/service/note-comments.service";
import { createHarness, statusOf, type Harness } from "./harness";

let h: Harness;
let alice: Awaited<ReturnType<Harness["signIn"]>>;
let bob: Awaited<ReturnType<Harness["signIn"]>>;

const MD = "## Pricing\n\nOur plan costs ten dollars.\n\nStudents get it free.\n\n## Support\n\nEmail us any time.";

beforeEach(async () => {
  h = await createHarness();
  alice = await h.signIn("alice@example.com");
  bob = await h.signIn("bob@example.com");
});

async function note(markdown = MD) {
  const page = await h.noteMarkdown.create(alice.workspaceId, { title: "Plan", markdown }, alice.id);
  const { page: full } = await h.pages.getOne(page.id, alice.id);
  const blocks = (full.document as { blocks: { id: string; type: string }[] }).blocks;
  return { id: page.id, blocks };
}
const markdownOf = async (id: string) => (await h.noteMarkdown.read(id, alice.id)).markdown;

describe("note comments", () => {
  it("applies an edit to exactly the selected block and the card sees it", async () => {
    const n = await note();
    const target = n.blocks[1]!; // "Our plan costs ten dollars."
    const [c] = await h.noteComments.create(alice.id, n.id, [
      { anchors: [target.id], quote: "ten dollars", body: "Say twelve dollars instead" },
    ]);
    expect(c).toMatchObject({ status: "pending", quote: "ten dollars", blockIds: [target.id] });

    const before = await h.noteComments.status(alice.id, n.id);
    expect(before.comments.map((x) => x.id)).toEqual([c!.id]);

    const [task] = await h.noteComments.get(alice.id, { ids: [c!.id] });
    expect(task).toMatchObject({ request: "Say twelve dollars instead", quote: "ten dollars", section: "Pricing" });
    expect(task!.markdown).toBe("Our plan costs ten dollars.");
    expect(task!.after).toBe("Students get it free.");

    const done = await h.noteComments.apply(alice.id, c!.id, "Our plan costs twelve dollars.");
    expect(done.status).toBe("done");
    const md = await markdownOf(n.id);
    expect(md).toContain("twelve dollars");
    expect(md).not.toContain("ten dollars");
    // Everything outside the selection is untouched.
    expect(md).toContain("Students get it free.");
    expect(md).toContain("Email us any time.");

    const after = await h.noteComments.status(alice.id, n.id, { ids: [c!.id], since: before.version });
    expect(after.comments[0]!.status).toBe("done");
    expect(after.version).not.toBe(before.version);
    expect(after.html).toContain("twelve dollars");
    // Unchanged since the last poll: no HTML resent.
    expect((await h.noteComments.status(alice.id, n.id, { since: after.version })).html).toBeUndefined();
  });

  it("anchors old notes without block ids by position, checked against the quote", async () => {
    const n = await note();
    const bare = n.blocks.map(({ id: _id, ...rest }) => rest);
    await h.pages.update(n.id, { document: { blocks: bare } }, alice.id);

    expect(await statusOf(h.noteComments.create(alice.id, n.id, [{ anchors: ["i:1"], quote: "not in that block", body: "x" }]))).toBe(409);

    const [c] = await h.noteComments.create(alice.id, n.id, [{ anchors: ["i:1"], quote: "ten dollars", body: "Shorter" }]);
    const { page } = await h.pages.getOne(n.id, alice.id);
    const blocks = (page.document as { blocks: { id?: string }[] }).blocks;
    expect(blocks.every((b) => typeof b.id === "string" && b.id)).toBe(true);
    expect(c!.blockIds).toEqual([blocks[1]!.id]);
  });

  it("refuses an apply over text that changed since the assistant read it", async () => {
    const n = await note();
    const [c] = await h.noteComments.create(alice.id, n.id, [{ anchors: [n.blocks[1]!.id], quote: "ten", body: "Fix" }]);
    expect(await statusOf(h.noteComments.apply(alice.id, c!.id, "Too early"))).toBe(400); // must read first

    await h.noteComments.get(alice.id, { ids: [c!.id] });
    // Someone edits that paragraph in the app meanwhile.
    const { page } = await h.pages.getOne(n.id, alice.id);
    const blocks = (page.document as { blocks: Record<string, unknown>[] }).blocks.map((b, i) =>
      i === 1 ? { ...b, content: [{ type: "text", text: "Our plan costs eleven dollars.", styles: {} }] } : b,
    );
    await h.pages.update(n.id, { document: { blocks } }, alice.id);
    expect(await statusOf(h.noteComments.apply(alice.id, c!.id, "Our plan costs twelve dollars."))).toBe(409);

    const [task] = await h.noteComments.get(alice.id, { ids: [c!.id] });
    expect(task!.markdown).toContain("eleven");
    expect((await h.noteComments.apply(alice.id, c!.id, "Our plan costs twelve dollars.")).status).toBe("done");
  });

  it("moves other comments on the same text to its replacement", async () => {
    const n = await note();
    const id = n.blocks[1]!.id;
    const [a, b] = await h.noteComments.create(alice.id, n.id, [
      { anchors: [id], quote: "ten dollars", body: "Twelve dollars" },
      { anchors: [id], quote: "Our plan", body: "Bold the price" },
    ]);
    await h.noteComments.get(alice.id, { ids: [a!.id, b!.id] });
    await h.noteComments.apply(alice.id, a!.id, "Our plan costs twelve dollars.");

    // b's text was rewritten: it points at the new block and must be read again.
    const after = (await h.noteComments.status(alice.id, n.id, { ids: [b!.id] })).comments[0]!;
    expect(after.status).toBe("pending");
    expect(after.blockIds).not.toContain(id);
    expect(await statusOf(h.noteComments.apply(alice.id, b!.id, "x"))).toBe(400);

    const [task] = await h.noteComments.get(alice.id, { ids: [b!.id] });
    expect(task!.markdown).toContain("twelve dollars");
    await h.noteComments.apply(alice.id, b!.id, "Our plan costs **twelve dollars**.");
    expect(await markdownOf(n.id)).toContain("**twelve dollars**");
  });

  it("removes the selection when the replacement is empty", async () => {
    const n = await note();
    const [c] = await h.noteComments.create(alice.id, n.id, [{ anchors: [n.blocks[2]!.id], quote: "Students", body: "Remove this" }]);
    await h.noteComments.get(alice.id, { ids: [c!.id] });
    await h.noteComments.apply(alice.id, c!.id, "");
    const md = await markdownOf(n.id);
    expect(md).not.toContain("Students");
    expect(md).toContain("ten dollars");
  });

  it("covers a selection across several blocks as one range", async () => {
    const n = await note();
    const [c] = await h.noteComments.create(alice.id, n.id, [
      { anchors: [n.blocks[2]!.id, n.blocks[1]!.id], quote: "", body: "Merge into one sentence" },
    ]);
    const [task] = await h.noteComments.get(alice.id, { ids: [c!.id] });
    expect(task!.markdown).toContain("ten dollars");
    expect(task!.markdown).toContain("Students");
    await h.noteComments.apply(alice.id, c!.id, "Ten dollars, free for students.");
    const md = await markdownOf(n.id);
    expect(md).toContain("Ten dollars, free for students.");
    expect(md).not.toContain("Our plan costs");
    expect(md).toContain("## Support");
  });

  it("declines, retries and cancels", async () => {
    const n = await note();
    const [c] = await h.noteComments.create(alice.id, n.id, [{ anchors: [n.blocks[1]!.id], body: "Make it rhyme" }]);
    await h.noteComments.get(alice.id, { ids: [c!.id] });
    expect(await h.noteComments.decline(alice.id, c!.id, "Rhymes would change the price meaning.")).toMatchObject({
      status: "declined",
      reason: "Rhymes would change the price meaning.",
    });
    expect((await h.noteComments.retry(alice.id, c!.id)).status).toBe("pending");
    expect((await h.noteComments.cancel(alice.id, c!.id)).status).toBe("cancelled");
    expect(await statusOf(h.noteComments.get(alice.id, { ids: [c!.id] }))).toBe(404);
  });

  it("is for editors only", async () => {
    const n = await note();
    const anchors = [n.blocks[1]!.id];
    // No access: nothing to see.
    expect(await statusOf(h.noteComments.create(bob.id, n.id, [{ anchors, body: "x" }]))).toBe(404);
    const [c] = await h.noteComments.create(alice.id, n.id, [{ anchors, body: "Fix" }]);
    expect(await statusOf(h.noteComments.get(bob.id, { ids: [c!.id] }))).toBe(404);
    expect(await statusOf(h.noteComments.apply(bob.id, c!.id, "x"))).toBe(404);
    expect(await statusOf(h.noteComments.cancel(bob.id, c!.id))).toBe(404);

    // A viewer can read the note but not comment or apply.
    await h.shares.add({ resourceKind: "page", resourceId: n.id, email: bob.email, role: "viewer" }, alice);
    expect(await statusOf(h.noteComments.create(bob.id, n.id, [{ anchors, body: "x" }]))).toBe(403);
    expect(await statusOf(h.noteComments.apply(bob.id, c!.id, "x"))).toBe(404);
  });

  it("limits open comments per note", async () => {
    const n = await note();
    const one = { anchors: [n.blocks[1]!.id], body: "Fix" };
    await h.noteComments.create(alice.id, n.id, Array.from({ length: MAX_OPEN_COMMENTS }, () => one));
    expect(await statusOf(h.noteComments.create(alice.id, n.id, [one]))).toBe(400);
  });

  it("tags each block in the card's HTML and keeps list numbering", async () => {
    const html = await noteDocumentToAnchoredHtml({
      blocks: [
        { id: "a", type: "paragraph", content: [{ type: "text", text: "Hi", styles: {} }], props: {}, children: [] },
        { id: "b", type: "numberedListItem", content: [{ type: "text", text: "one", styles: {} }], props: {}, children: [] },
        { id: "c", type: "numberedListItem", content: [{ type: "text", text: "two", styles: {} }], props: {}, children: [] },
        { type: "paragraph", content: [{ type: "text", text: "no id", styles: {} }], props: {}, children: [] },
      ],
    });
    expect(html).toContain('<div data-b="a">');
    expect(html).toContain('<div data-b="c"><ol start="2">');
    expect(html).toContain('<div data-b="i:3">');
  });
});
