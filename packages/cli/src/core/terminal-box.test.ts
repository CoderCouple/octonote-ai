import { describe, expect, it } from "vitest";
import { box, fitLines } from "./terminal-box.js";
import { visible } from "./terminal-markdown.js";

const B = "\u001b[1m";
const LINK = "\u001b]8;;https://a.io\u001b\\";
const END = "\u001b]8;;\u001b\\";

describe("terminal box", () => {
  it("cuts a long word to the pane", () => {
    expect(fitLines(["abcdefgh"], 3)).toEqual(["abc", "def", "gh"]);
  });

  it("closes styles and links at the line's end and reopens them on the next", () => {
    const [a, b] = fitLines([`${LINK}${B}one`, `two\u001b[22m${END}`], 10);
    expect(a!.endsWith(`\u001b[0m${END}`)).toBe(true);
    expect(b!.startsWith(`${LINK}${B}`)).toBe(true);
    expect(b!.endsWith(END)).toBe(true);
  });

  it("keeps every row the same width, with emoji and colour", () => {
    const out = box("Title", `${B}bold\u001b[22m ✅\nplain`, 30, true).split("\n");
    for (const l of out) expect(visible(l)).toBe(30);
  });

  it("shortens a long title to fit the border", () => {
    const top = box("x".repeat(100), "b", 30, false).split("\n")[0]!;
    expect(top.length).toBe(30);
    expect(top).toContain("…");
  });
});
