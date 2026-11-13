import { describe, expect, it } from "vitest";
import { triggerAtCaret } from "../src/composer";
import { firstPart, formatClips, formatItem, INSERT_LIMIT, type ItemContent } from "../src/insert-format";

const note: ItemContent = {
  id: "pag_1",
  kind: "note",
  title: "Solid-state batteries",
  url: "https://octonote.ai/n/pag_1",
  markdown: "# Batteries\n\nSolid electrolytes are safer.",
  chars: 44,
  hasImage: false,
};

describe("what goes into the chat", () => {
  it("marks a note as coming from Octonote, with a link back", () => {
    expect(formatItem(note)).toBe(
      "From my Octonote note “Solid-state batteries” (https://octonote.ai/n/pag_1):\n\n# Batteries\n\nSolid electrolytes are safer.\n\n[End of “Solid-state batteries”]",
    );
  });

  it("says whether a canvas's picture is attached", () => {
    const canvas = { ...note, kind: "canvas" as const, markdown: "```mermaid\nflowchart TD\n  A --> B\n```", hasImage: true };
    expect(formatItem(canvas, { withImage: true })).toContain("The attached image shows the canvas");
    expect(formatItem(canvas, { withImage: false })).toContain("as a Mermaid diagram:");
  });

  it("cuts long notes at a paragraph break and says so", () => {
    const paragraph = "word ".repeat(200).trim();
    const long = { ...note, markdown: Array.from({ length: 60 }, () => paragraph).join("\n\n") };
    const text = formatItem(long);
    expect(text.length).toBeLessThan(INSERT_LIMIT + 400);
    expect(text).toMatch(/\[Shortened: this is the first [\d,]+ of [\d,]+ characters\. Full note: https:\/\/octonote\.ai\/n\/pag_1\]$/);
    expect(formatItem(long, { whole: true })).toContain("[End of");
  });

  it("never leaves a code block open when cutting", () => {
    const text = `${"a ".repeat(10_000)}\n\n\`\`\`js\n${"x\n".repeat(20_000)}\`\`\``;
    expect((firstPart(text).match(/```/g) ?? []).length % 2).toBe(0);
  });

  it("numbers clips with where each came from", () => {
    const text = formatClips("EV charging", [
      { id: "1", content: "Fast chargers hit 350 kW.", source: { app: "chatgpt", title: "Chargers", url: "https://chatgpt.com/c/1" }, position: 0, createdAt: "" },
      { id: "2", content: "Home charging is slower.", source: null, position: 1, createdAt: "" },
    ]);
    expect(text).toBe(
      "Clips I collected in Octonote for “EV charging”:\n\n[1] From ChatGPT “Chargers” (https://chatgpt.com/c/1)\nFast chargers hit 350 kW.\n\n[2] From elsewhere\nHome charging is slower.",
    );
  });
});

describe("the message box", () => {
  it("spots #octonote typed as its own word, and the search after it, in a textarea", () => {
    const box = document.createElement("textarea");
    document.body.append(box);
    const at = (value: string) => {
      box.value = value;
      box.setSelectionRange(value.length, value.length);
      return triggerAtCaret(box);
    };
    expect(at("compare with #octonote")).toEqual({ spot: { kind: "textarea", start: 13, end: 22 }, query: "" });
    expect(at("compare with #octonote battery cells")).toEqual({ spot: { kind: "textarea", start: 13, end: 36 }, query: "battery cells" });
    expect(at("#octonote")?.query).toBe("");
    expect(at("tag#octonote")).toBeNull();
    expect(at("#octonote\nnext line")).toBeNull();
    expect(at("#octonotes")).toBeNull();
  });

  it("spots #octonote and its search at the caret in a rich editor", () => {
    const editor = document.createElement("div");
    editor.contentEditable = "true";
    editor.textContent = "Use this #octonote batt";
    document.body.append(editor);
    const text = editor.firstChild!;
    const caret = document.createRange();
    caret.setStart(text, text.textContent!.length);
    getSelection()!.removeAllRanges();
    getSelection()!.addRange(caret);
    const found = triggerAtCaret(editor);
    expect(found?.query).toBe("batt");
    expect(found?.spot.kind === "range" && found.spot.range.toString()).toBe("#octonote batt");
    // Pasting into real editors is checked end to end against ProseMirror (see the extension's e2e run).
  });
});
