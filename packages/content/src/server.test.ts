import { describe, expect, it } from "vitest";
import { markdownToNoteDocument, noteDocumentToMarkdown } from "./server";

const SAMPLE = `# Caching

Caches keep **hot** data close. Cost is $O(1)$ per hit, not $5.

- [ ] Measure
- [x] Add Redis

1. First
2. Second

\`\`\`ts
const price = "$9 and $10";
\`\`\`

\`\`\`mermaid
graph TD
  A --> B
\`\`\`

$$
E = mc^2
$$

| Key | TTL |
| --- | --- |
| user | $t$ |

> Keep it simple.

![diagram](https://example.com/d.png)
`;

describe("markdown → note document", () => {
  it("builds standard blocks plus Octonote's math and mermaid blocks", async () => {
    const { blocks } = await markdownToNoteDocument(SAMPLE);
    const types = blocks.map((b) => b.type);
    expect(types).toEqual([
      "heading",
      "paragraph",
      "checkListItem",
      "checkListItem",
      "numberedListItem",
      "numberedListItem",
      "codeBlock",
      "mermaid",
      "mathBlock",
      "table",
      "quote",
      "image",
    ]);
    // Every block has an id (the heading minimap anchors to them).
    expect(blocks.every((b) => typeof b.id === "string" && b.id)).toBe(true);
    // Inline math, but a price stays text.
    const para = blocks[1]!.content as { type: string; text?: string; props?: { latex: string } }[];
    expect(para.some((c) => c.type === "math" && c.props?.latex === "O(1)")).toBe(true);
    expect(para.map((c) => c.text ?? "").join("")).toContain("$5");
    // `$` inside code is left alone.
    expect(JSON.stringify(blocks[6])).toContain("$9 and $10");
    expect(blocks[3]!.props.checked).toBe(true);
    expect(blocks[7]!.props.code).toContain("A --> B");
    expect(blocks[8]!.props.latex).toBe("E = mc^2");
    expect(blocks[11]!.props.url).toBe("https://example.com/d.png");
  });

  it("round-trips through markdown without losing the special blocks", async () => {
    const doc = await markdownToNoteDocument(SAMPLE);
    const md = await noteDocumentToMarkdown(doc);
    expect(md).toContain("# Caching");
    expect(md).toContain("```mermaid");
    expect(md).toContain("```math");
    expect(md).toContain("`$O(1)$`");
    const again = await markdownToNoteDocument(md);
    expect(again.blocks.map((b) => b.type)).toEqual(doc.blocks.map((b) => b.type));
  });

  it("keeps links whose text is code (BlockNote can't nest code in a link)", async () => {
    const doc = await markdownToNoteDocument(
      "See [`Ledger`](https://x.dev/a#L1), [the `run_task` fn](https://x.dev/b) and `list[str]` and ![`img`](https://x.dev/i.png).",
    );
    const content = (doc.blocks[0] as { content: Record<string, any>[] }).content;
    const links = content.filter((c) => c.type === "link");
    expect(links.map((l) => [l.href, l.content.map((t: { text: string }) => t.text).join("")])).toEqual([
      ["https://x.dev/a#L1", "Ledger"],
      ["https://x.dev/b", "the run_task fn"],
    ]);
    expect(content.some((c) => c.text === "list[str]" && c.styles?.code)).toBe(true);
  });

  it("reads snake_case and _private names as text, not emphasis", async () => {
    const doc = await markdownToNoteDocument(
      "Call _write_rollout, see [_fallback_x](https://x.dev/a_b#L1) at https://x.dev/c_d and keep _real italic_.",
    );
    const content = (doc.blocks[0] as { content: Record<string, any>[] }).content;
    const flat = content.flatMap((c) => (c.type === "link" ? c.content.map((t: object) => ({ ...t, href: c.href })) : [c]));
    expect(flat.find((c) => c.text?.includes("_write_rollout"))?.styles?.italic).toBeFalsy();
    expect(content.find((c) => c.type === "link" && c.href === "https://x.dev/a_b#L1")!.content[0].text).toBe("_fallback_x");
    expect(flat.some((c) => c.text?.includes("https://x.dev/c_d") || c.href === "https://x.dev/c_d")).toBe(true);
    expect(flat.find((c) => c.text === "real italic")?.styles?.italic).toBe(true);
  });

  it("handles an empty document", async () => {
    expect(await noteDocumentToMarkdown({})).toBe("");
    expect((await markdownToNoteDocument("")).blocks.length).toBeLessThanOrEqual(1);
  });
});
