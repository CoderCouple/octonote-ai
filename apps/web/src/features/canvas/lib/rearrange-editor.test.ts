// @vitest-environment happy-dom
import { createShapeId, createTLStore, defaultBindingUtils, defaultShapeUtils, Editor } from "tldraw";
import { describe, expect, it } from "vitest";
import { rearrangeShapes } from "./rearrange";

function makeEditor() {
  const container = document.createElement("div");
  document.body.appendChild(container);
  return new Editor({
    store: createTLStore({ shapeUtils: defaultShapeUtils, bindingUtils: defaultBindingUtils }),
    shapeUtils: defaultShapeUtils,
    bindingUtils: defaultBindingUtils,
    tools: [],
    getContainer: () => container,
  });
}

describe("rearrange in the editor", () => {
  it("moves bound boxes into a chain, keeps the group around its boxes, and undoes in one step", () => {
    const editor = makeEditor();
    const [a, b, c, group] = [createShapeId("a"), createShapeId("b"), createShapeId("c"), createShapeId("g")];
    editor.createShapes([
      { id: group, type: "geo", x: 0, y: 0, props: { w: 700, h: 300, dash: "dashed" } },
      { id: a, type: "geo", x: 400, y: 100, props: { w: 120, h: 60} },
      { id: b, type: "geo", x: 40, y: 120, props: { w: 120, h: 60 } },
      { id: c, type: "geo", x: 900, y: 600, props: { w: 120, h: 60 } },
    ]);
    const arrow = (id: string, from: typeof a, to: typeof a) => {
      const arrowId = createShapeId(id);
      editor.createShape({ id: arrowId, type: "arrow", x: 0, y: 0 });
      editor.createBindings(
        ([["start", from], ["end", to]] as const).map(([terminal, toId]) => ({
          type: "arrow" as const,
          fromId: arrowId,
          toId,
          props: { terminal, normalizedAnchor: { x: 0.5, y: 0.5 }, isExact: false, isPrecise: false, snap: "none" as const },
        })),
      );
    };
    arrow("ab", a, b);
    arrow("bc", b, c);
    const before = editor.getShape(a)!.y;

    expect(rearrangeShapes(editor, "vertical")).toBe(true);
    const y = (id: typeof a) => editor.getShapePageBounds(id)!;
    expect(y(a).y).toBeLessThan(y(b).y);
    expect(y(b).y).toBeLessThan(y(c).y);
    const g = y(group);
    for (const id of [a, b]) expect(g.contains(y(id))).toBe(true);
    expect(g.contains(y(c))).toBe(false);

    editor.undo();
    expect(editor.getShape(a)!.y).toBe(before);
  });
});
