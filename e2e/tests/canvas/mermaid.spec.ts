import { CanvasUi, ofType, shapes } from "../../helpers/canvas";
import { e2eTitle, expect, test } from "../../helpers/fixtures";

const FLOW = `flowchart LR
  subgraph Backend
    API[API server] --> DB[(Database)]
  end
  U([User]) --> API
  API -.-> Cache{Cache?}
  click API "https://octonote.ai/docs"`;

const CLASSES = `classDiagram
  class Animal {
    +String name
    +eat()
  }
  class Dog
  Animal <|-- Dog
  Dog --> Bone : chews`;

test.describe("mermaid canvases created through the API", () => {
  test("flowchart with a subgraph and a click link", async ({ page, api, enter }) => {
    const c = await api.createCanvas(e2eTitle("mermaid flow"), { mermaid: FLOW });
    const doc = c.document;
    // Subgraph box + its title, 4 nodes, 3 edges.
    expect(doc.items).toHaveLength(9);
    expect(shapes(doc, "diamond")).toHaveLength(1);
    expect(ofType(doc, "line")).toHaveLength(3);
    for (const l of ofType(doc, "line")) {
      expect(l.start.item).toBeTruthy();
      expect(l.end.item).toBeTruthy();
    }
    expect(doc.items.find((i) => i.link)).toMatchObject({ text: "API server", link: "https://octonote.ai/docs" });

    await enter(`/c/${c.id}`);
    const ui = await new CanvasUi(page).ready({ items: 9 });
    for (const label of ["Backend", "API server", "Database", "User", "Cache?"])
      await expect(ui.root.getByText(label, { exact: true })).toBeVisible();
    await expect(ui.root.locator(".occ-link-badge")).toHaveCount(1);
    await expect(ui.item(doc.items.find((i) => i.link)!.id).locator(".occ-link-badge")).toHaveAttribute("href", "https://octonote.ai/docs");
  });

  test("class diagram", async ({ page, api, enter }) => {
    const c = await api.createCanvas(e2eTitle("mermaid class"), { mermaid: CLASSES });
    // Animal, Dog, Bone + inheritance and association lines.
    expect(shapes(c.document)).toHaveLength(3);
    expect(ofType(c.document, "line")).toHaveLength(2);
    await enter(`/c/${c.id}`);
    const ui = await new CanvasUi(page).ready({ items: c.document.items.length });
    await expect(ui.root.getByText("Dog", { exact: true })).toBeVisible();
    await expect(ui.root.getByText("chews")).toBeVisible();
    await expect(ui.root.getByText(/\+eat\(\)/)).toBeVisible();
  });

  test("PUT /canvases/:id/mermaid redraws an open canvas after reload", async ({ page, api, enter }) => {
    const c = await api.createCanvas(e2eTitle("mermaid redraw"), { mermaid: "flowchart TD\n  A --> B" });
    await enter(`/c/${c.id}`);
    await new CanvasUi(page).ready({ items: 3 });
    await api.request("PUT", `/canvases/${c.id}/mermaid`, { mermaid: "flowchart TD\n  A --> B\n  B --> C\n  C --> D" });
    await page.reload();
    await new CanvasUi(page).ready({ items: 7 });
  });
});
