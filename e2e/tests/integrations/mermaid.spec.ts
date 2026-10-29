/** Mermaid → octodraw: POST with `mermaid`, PUT /canvases/:id/mermaid, and the errors. */
import { expect, test } from "@playwright/test";
import { cleanup, devClient, expectOctodraw, itemsOf, tag, type Client } from "./_support";

let c: Client;
const made: { kind: "canvas"; id: string }[] = [];
test.beforeAll(async () => {
  c = await devClient();
});
test.afterAll(async () => {
  await cleanup(c, made);
});

const FLOW = [
  "flowchart LR",
  "  subgraph Auth [Auth service]",
  "    A([User]) -->|submits| B{Valid?}",
  "  end",
  "  B -->|yes| C[Dashboard]",
  "  B -.->|no| D[(Errors)]",
  '  click C "https://octonote.ai/x"',
].join("\n");

const CLASSES = ["classDiagram", "  class Animal {", "    +String name", "    +eat() void", "  }", "  Animal <|-- Dog", "  Dog : +bark()"].join("\n");

async function create(body: Record<string, unknown>) {
  const r = await c.call("POST", `/workspaces/${c.workspaceId}/canvases`, { title: `E2E mermaid ${tag()}`, ...body });
  if (r.status < 300) made.push({ kind: "canvas", id: r.result.id });
  return r;
}

const byText = (doc: any, text: string) => doc.items.find((i: any) => i.text === text);

test("a flowchart becomes shapes, labelled lines, a subgraph box and item links", async () => {
  const r = await create({ mermaid: FLOW });
  expect(r.status, JSON.stringify(r.body)).toBe(201);
  const doc = r.result.document;
  expectOctodraw(doc);

  for (const label of ["User", "Valid?", "Dashboard", "Errors"]) expect(byText(doc, label), label).toBeTruthy();
  expect(byText(doc, "Valid?").shape).toBe("diamond");

  // The subgraph: a group box plus its title.
  expect(byText(doc, "Auth service")).toBeTruthy();
  const box = doc.items.find((i: any) => i.type === "shape" && !i.text && /Auth/.test(i.id));
  expect(box).toBeTruthy();
  const user = byText(doc, "User");
  expect(user.x).toBeGreaterThanOrEqual(box.x);
  expect(user.x + user.w).toBeLessThanOrEqual(box.x + box.w);

  // Edges: attached at both ends, labels kept, -.-> dashed.
  const lines = itemsOf(doc, "line");
  expect(lines).toHaveLength(3);
  const ids = new Set(doc.items.map((i: any) => i.id));
  for (const l of lines) {
    expect(ids.has(l.start.item)).toBe(true);
    expect(ids.has(l.end.item)).toBe(true);
    expect(l.endArrow).toBe(true);
  }
  expect(lines.map((l: any) => l.text).sort()).toEqual(["no", "submits", "yes"]);
  expect(lines.find((l: any) => l.text === "no").dashed).toBe(true);
  expect(lines.find((l: any) => l.text === "yes").dashed ?? false).toBe(false);

  // click → the item's link.
  expect(byText(doc, "Dashboard").link).toBe("https://octonote.ai/x");

  // GET returns the same drawing.
  const got = await c.ok("GET", `/canvases/${r.result.id}`);
  expect(got.document).toEqual(doc);
});

test("a class diagram becomes class boxes with members and an inheritance arrow", async () => {
  const r = await create({ mermaid: CLASSES });
  expect(r.status, JSON.stringify(r.body)).toBe(201);
  const doc = r.result.document;
  expectOctodraw(doc);
  const shapes = itemsOf(doc, "shape");
  const animal = shapes.find((s: any) => s.text?.startsWith("Animal"));
  const dog = shapes.find((s: any) => s.text?.startsWith("Dog"));
  expect(animal.text).toContain("+String name");
  expect(animal.text).toContain("+eat() void");
  expect(dog.text).toContain("+bark()");
  const [edge] = itemsOf(doc, "line");
  expect([edge.start.item, edge.end.item].sort()).toEqual([animal.id, dog.id].sort());
  expect(edge.startArrow || edge.endArrow).toBe(true);
});

test("PUT /canvases/:id/mermaid redraws the canvas (and can rename it)", async () => {
  const r = await create({ mermaid: FLOW });
  const id = r.result.id;
  const redrawn = await c.ok("PUT", `/canvases/${id}/mermaid`, { mermaid: "graph TD\n  X[One] --> Y[Two]", title: "E2E redrawn" });
  expect(redrawn.title).toBe("E2E redrawn");
  expectOctodraw(redrawn.document);
  expect(byText(redrawn.document, "Dashboard")).toBeFalsy();
  expect(byText(redrawn.document, "One")).toBeTruthy();
  expect(itemsOf(redrawn.document, "line")).toHaveLength(1);
  const got = await c.ok("GET", `/canvases/${id}`);
  expect(got.document).toEqual(redrawn.document);

  // Title optional.
  const again = await c.ok("PUT", `/canvases/${id}/mermaid`, { mermaid: CLASSES });
  expect(again.title).toBe("E2E redrawn");
  expect(itemsOf(again.document, "shape").length).toBe(2);
});

test("unsupported diagrams fail cleanly with MERMAID_INVALID and nothing is created", async () => {
  const before = (await c.ok<any[]>("GET", `/workspaces/${c.workspaceId}/canvases`)).length;
  const title = `E2E unsupported ${tag()}`;
  const r = await c.call("POST", `/workspaces/${c.workspaceId}/canvases`, { title, mermaid: "sequenceDiagram\n  A->>B: hi" });
  expect(r.status).toBe(400);
  expect(r.body.extra?.code).toBe("MERMAID_INVALID");
  expect(r.body.extra?.line).toBe(1);
  expect(r.body.message).toMatch(/flowchart/i);
  const after = await c.ok<any[]>("GET", `/workspaces/${c.workspaceId}/canvases`);
  expect(after.some((x) => x.title === title)).toBe(false);
  expect(after.length).toBe(before);

  const canvas = (await create({})).result;
  for (const mermaid of ["pie title Pets\n  \"Dogs\" : 3", "flowchart TD\n  A -->", "not a diagram at all"]) {
    const rr = await c.call("PUT", `/canvases/${canvas.id}/mermaid`, { mermaid });
    expect(rr.status, `${mermaid} → ${JSON.stringify(rr.body)}`).toBe(400);
    expect(rr.body.extra?.code).toBe("MERMAID_INVALID");
  }
  const empty = await c.call("PUT", `/canvases/${canvas.id}/mermaid`, { mermaid: "" });
  expect(empty.status).toBe(400);
  // The canvas wasn't touched.
  expect((await c.ok("GET", `/canvases/${canvas.id}`)).document).toEqual({ version: 1, items: [] });
});

test("a javascript: click target never becomes a link", async () => {
  const r = await create({ mermaid: 'flowchart TD\n  A[Hi] --> B[There]\n  click A "javascript:alert(1)"' });
  if (r.status === 400) return; // rejected outright is fine too
  expect(r.status).toBe(201);
  const a = byText(r.result.document, "Hi");
  expect(a.link ?? "").not.toMatch(/^javascript:/i);
});

test("arrows written without spaces (A-->B, A-.->B, A---B) parse", async () => {
  for (const mermaid of ["graph TD\n  A-->B", "flowchart LR\n  A-.->B\n  B---C", "graph TD\n  A-->|yes|B"]) {
    const r = await create({ mermaid });
    expect(r.status, `${JSON.stringify(mermaid)} → ${JSON.stringify(r.body?.message)}`).toBe(201);
    expect(itemsOf(r.result.document, "line").length).toBeGreaterThan(0);
  }
});
