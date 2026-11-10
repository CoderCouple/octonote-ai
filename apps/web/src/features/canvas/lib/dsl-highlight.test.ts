import { describe, expect, it } from "vitest";
import { highlightDsl, highlightDslLine } from "./dsl-highlight";

const kinds = (line: string) =>
  highlightDslLine(line).map((t) => [t.text, t.kind]);

describe("highlightDslLine", () => {
  it("colours settings, nodes with properties and comments", () => {
    expect(kinds("direction right")).toEqual([
      ["direction", "keyword"],
      [" ", "plain"],
      ["right", "value"],
    ]);
    expect(
      kinds(
        '  Build [label: "Building an LLM", shape: rectangle, textSize: 18] // main box',
      ),
    ).toEqual([
      ["  ", "plain"],
      ["Build", "name"],
      [" ", "plain"],
      ["[", "punct"],
      ["label", "attr"],
      [":", "punct"],
      [" ", "plain"],
      ['"Building an LLM"', "value"],
      [",", "punct"],
      [" ", "plain"],
      ["shape", "attr"],
      [":", "punct"],
      [" ", "plain"],
      ["rectangle", "value"],
      [",", "punct"],
      [" ", "plain"],
      ["textSize", "attr"],
      [":", "punct"],
      [" ", "plain"],
      ["18", "number"],
      ["]", "punct"],
      [" ", "plain"],
      ["// main box", "comment"],
    ]);
  });

  it("colours arrows, their labels and groups", () => {
    expect(kinds("Build > Foundation: 4) Pretraining")).toEqual([
      ["Build", "name"],
      [" ", "plain"],
      [">", "operator"],
      [" ", "plain"],
      ["Foundation", "name"],
      [":", "punct"],
      [" ", "plain"],
      ["4) Pretraining", "label"],
    ]);
    expect(kinds("A --> B")).toEqual([
      ["A", "name"],
      [" ", "plain"],
      ["-->", "operator"],
      [" ", "plain"],
      ["B", "name"],
    ]);
    expect(kinds("Stage 1 [color: gray] {")[0]).toEqual(["Stage", "name"]);
    expect(
      kinds("In0 > Sum: × 0.13 [color: orange]").map((t) => t[1]),
    ).toContain("label");
  });

  it("keeps every character, including half-typed lines", () => {
    for (const line of [
      'Node [label: "unclosed',
      "A > ",
      "loop [label: x] {",
      "x-ray - y",
      "   ",
    ]) {
      expect(
        highlightDslLine(line)
          .map((t) => t.text)
          .join(""),
      ).toBe(line);
    }
    expect(highlightDsl("a\nb").length).toBe(2);
  });

  it("reads a dash inside a name as part of the name", () => {
    expect(kinds("x-ray")).toEqual([["x-ray", "name"]]);
  });
});
