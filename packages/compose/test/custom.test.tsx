import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { checkBlock, compose, CUSTOM_CSP, customEntry, customSrcDoc, defaultCatalog, readCustomMessage, type ModelClient } from "../src/index.js";
import { CustomExperience } from "../src/react-entry.js";

afterEach(cleanup);

const catalog = defaultCatalog.with(customEntry);
const block = customEntry.example as { kind: "custom"; title: string; description: string; html: string };

describe("custom blocks", () => {
  it("validate their example and refuse oversized code", () => {
    expect(checkBlock(catalog, block, "b1").ok).toBe(true);
    expect(checkBlock(catalog, { ...block, html: "x".repeat(200_000) }, "b1").ok).toBe(false);
  });

  it("aren't available unless a developer opts in", () => {
    expect(defaultCatalog.get("custom")).toBeUndefined();
  });

  it("put the no-network policy and the bridge before any generated code", () => {
    const doc = customSrcDoc('<script>fetch("https://evil.example")</script>', "abc");
    const csp = doc.indexOf("Content-Security-Policy");
    expect(csp).toBeGreaterThan(-1);
    expect(csp).toBeLessThan(doc.indexOf("evil.example"));
    expect(doc.indexOf("window.host")).toBeLessThan(doc.indexOf("evil.example"));
    expect(CUSTOM_CSP).toContain("default-src 'none'");
    expect(CUSTOM_CSP).toContain("connect-src 'none'");
  });

  it("only accept known bridge messages with the right secret", () => {
    expect(readCustomMessage({ source: "octonote-custom", nonce: "n", type: "complete", score: 80 }, "n")).toMatchObject({ type: "complete", score: 80 });
    expect(readCustomMessage({ source: "octonote-custom", nonce: "wrong", type: "complete", score: 80 }, "n")).toBeNull();
    expect(readCustomMessage({ source: "octonote-custom", nonce: "n", type: "navigate", url: "https://x" }, "n")).toBeNull();
    expect(readCustomMessage({ source: "octonote-custom", nonce: "n", type: "event", name: "x", data: "y".repeat(5000) }, "n")).toBeNull();
  });
});

describe("CustomExperience", () => {
  it("doesn't run until the learner asks, then runs in a locked-down frame", () => {
    const { container } = render(<CustomExperience block={block} />);
    expect(container.querySelector("iframe")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Run it" }));
    const frame = container.querySelector("iframe")!;
    expect(frame.getAttribute("sandbox")).toBe("allow-scripts");
    expect(frame.getAttribute("srcdoc")).toContain("Content-Security-Policy");
    fireEvent.click(screen.getByRole("button", { name: "View code" }));
    expect(screen.getByText(/host.complete\(100\)/)).toBeTruthy();
  });

  it("ignores messages that don't come from its own frame", () => {
    const onComplete = vi.fn();
    const { container } = render(<CustomExperience block={block} onComplete={onComplete} />);
    fireEvent.click(screen.getByRole("button", { name: "Run it" }));
    const srcdoc = container.querySelector("iframe")!.getAttribute("srcdoc")!;
    const nonce = /nonce=("[0-9a-f]+")/.exec(srcdoc)![1]!.replace(/"/g, "");
    // Right secret, but sent by the page itself rather than the frame.
    act(() => {
      window.dispatchEvent(new MessageEvent("message", { data: { source: "octonote-custom", nonce, type: "complete", score: 100 }, source: window }));
    });
    expect(onComplete).not.toHaveBeenCalled();
  });
});

describe("composing with custom code", () => {
  it("offers the custom block to the writer only when the plan calls for it and it's allowed", async () => {
    const tools: string[] = [];
    const model: ModelClient = {
      async callTool({ tool }) {
        tools.push(JSON.stringify(tool.inputSchema));
        return tool.name === "plan_response" ? { strategy: "custom", reason: "A bespoke game.", customIdea: "Trace blood flow", blocks: [{ kind: "text", purpose: "Intro" }] } : { blocks: [{ kind: "text", markdown: "Try this:" }, block] };
      },
    };
    const allowed = await compose({ question: "heart game", model, allowCustom: true });
    expect(allowed.response.blocks.map((b) => b.kind)).toEqual(["text", "custom"]);
    expect(tools[1]).toContain('"const":"custom"');

    tools.length = 0;
    const refused = await compose({ question: "heart game", model });
    expect(refused.response.blocks.map((b) => b.kind)).toEqual(["text"]);
    expect(tools[1]).not.toContain('"const":"custom"');
  });
});
