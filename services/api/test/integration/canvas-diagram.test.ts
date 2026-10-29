/**
 * Canvases drawn from mermaid flowcharts (the CLI / agent surface): real
 * shapes saved through the normal canvas rules, bad input rejected up front.
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

const FLOW = "graph LR\n  A[API] --> B[(DB)]\n  A --> C([Queue])";
const itemsOf = (doc: unknown) => (doc as { version: number; items: { type: string }[] }).items;

describe("canvases from mermaid", () => {
  it("creates a drawn canvas", async () => {
    const canvas = await h.canvasDiagrams.create(alice.workspaceId, { title: "Flow", mermaid: FLOW }, alice.id);
    expect(canvas.document.version).toBe(1);
    const items = itemsOf(canvas.document);
    expect(items.filter((s) => s.type === "shape")).toHaveLength(3);
    expect(items.filter((s) => s.type === "line")).toHaveLength(2);
    const { canvas: stored } = await h.canvases.getOne(canvas.id, alice.id);
    expect(itemsOf(stored.document)).toHaveLength(5);
  });

  it("rejects non-flowcharts before creating anything", async () => {
    const err = await h.canvasDiagrams
      .create(alice.workspaceId, { title: "Seq", mermaid: "sequenceDiagram\n A->>B: hi" }, alice.id)
      .catch((e) => e);
    expect(err.getStatus?.() ?? err.status).toBe(400);
    expect(JSON.stringify(err.getResponse?.() ?? err)).toContain("MERMAID_INVALID");
    expect(await h.canvases.listStandalone(alice.workspaceId, alice.id)).toHaveLength(0);
  });

  it("redraws only with edit access", async () => {
    const canvas = await h.canvasDiagrams.create(alice.workspaceId, { title: "Flow", mermaid: FLOW }, alice.id);
    expect(await statusOf(h.canvasDiagrams.replace(canvas.id, "graph TD\n X --> Y", undefined, bob.id))).toBe(404);
    const redrawn = await h.canvasDiagrams.replace(canvas.id, "graph TD\n X --> Y", "Renamed", alice.id);
    expect(redrawn.title).toBe("Renamed");
    expect(itemsOf(redrawn.document).filter((s) => s.type === "shape")).toHaveLength(2);
  });
});
