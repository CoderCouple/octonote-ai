/**
 * Notes as markdown (the CLI / agent surface): converted with the same
 * parser as the editor, readable back as markdown, appendable — and every
 * permission rule still applies.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { createHarness, statusOf, type Harness } from "./harness";

let h: Harness;
let alice: Awaited<ReturnType<Harness["signIn"]>>;
let bob: Awaited<ReturnType<Harness["signIn"]>>;

beforeEach(async () => {
  h = await createHarness();
  alice = await h.signIn("alice@example.com");
  bob = await h.signIn("bob@example.com");
});

const MD = "# Plan\n\nShip the **CLI**. Cost: $O(n)$.\n\n```mermaid\ngraph LR\n  A --> B\n```\n";

describe("notes as markdown", () => {
  it("creates a note from markdown, with editor-ready blocks and contentMd", async () => {
    const page = await h.noteMarkdown.create(alice.workspaceId, { title: "Plan", markdown: MD }, alice.id);
    const blocks = (page.document as { blocks: { type: string; id: string }[] }).blocks;
    expect(blocks.map((b) => b.type)).toEqual(["heading", "paragraph", "mermaid"]);
    expect(blocks.every((b) => b.id)).toBe(true);
    expect(page.contentMd).toBe(MD);

    const read = await h.noteMarkdown.read(page.id, alice.id);
    expect(read.title).toBe("Plan");
    expect(read.markdown).toContain("# Plan");
    expect(read.markdown).toContain("```mermaid");
    expect(read.markdown).toContain("`$O(n)$`");
  });

  it("appends and replaces", async () => {
    const page = await h.noteMarkdown.create(alice.workspaceId, { title: "Log", markdown: "First." }, alice.id);
    const appended = await h.noteMarkdown.append(page.id, "- second\n- third", alice.id);
    const types = (appended.document as { blocks: { type: string }[] }).blocks.map((b) => b.type);
    expect(types).toEqual(["paragraph", "bulletListItem", "bulletListItem"]);
    expect(appended.contentMd).toBe("First.\n\n- second\n- third");

    const replaced = await h.noteMarkdown.replace(page.id, "Only this.", "Renamed", alice.id);
    expect(replaced.title).toBe("Renamed");
    expect((replaced.document as { blocks: unknown[] }).blocks).toHaveLength(1);
  });

  it("keeps permissions: strangers can't read or write, viewers can only read", async () => {
    const page = await h.noteMarkdown.create(alice.workspaceId, { title: "Private", markdown: "secret" }, alice.id);
    expect(await statusOf(h.noteMarkdown.read(page.id, bob.id))).toBe(404);
    expect(await statusOf(h.noteMarkdown.append(page.id, "hi", bob.id))).toBe(404);

    await h.shares.add({ resourceKind: "page", resourceId: page.id, email: bob.email, role: "viewer" }, { id: alice.id, email: alice.email });
    expect((await h.noteMarkdown.read(page.id, bob.id)).markdown).toContain("secret");
    expect(await statusOf(h.noteMarkdown.replace(page.id, "x", undefined, bob.id))).toBe(403);
    expect(await statusOf(h.noteMarkdown.append(page.id, "x", bob.id))).toBe(403);
  });

  it("lets anyone with the link read it signed out", async () => {
    const page = await h.noteMarkdown.create(alice.workspaceId, { title: "Open", markdown: "hello" }, alice.id);
    expect(await statusOf(h.noteMarkdown.read(page.id, null))).toBe(404);
    await h.settings.setGeneralAccess("page", page.id, { linkAccess: "anyone_with_link", linkRole: "viewer" }, alice.id);
    expect((await h.noteMarkdown.read(page.id, null)).markdown).toContain("hello");
  });
});
