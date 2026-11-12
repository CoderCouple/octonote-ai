import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import pythagoras from "../examples/pythagoras.json" with { type: "json" };
import {
  compileScene,
  computeLayout,
  CountUp,
  DARK_THEME,
  FadeIn,
  outlineToolDefinition,
  parseScene,
  renderFrame,
  ScenePlayer,
  sceneRequest,
  sceneToolDefinition,
  Typewriter,
  validateScene,
} from "../src/index.js";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const dir = join(import.meta.dirname, "../examples");
const examples = readdirSync(dir)
  .filter((f) => f.endsWith(".json"))
  .map((f) => ({ file: f, spec: JSON.parse(readFileSync(join(dir, f), "utf8")) as unknown }));

describe("examples", () => {
  it.each(examples)("$file is valid and renders every frame", ({ spec }) => {
    const result = validateScene(spec);
    expect(result.ok ? [] : result.issues).toEqual([]);
    if (!result.ok) return;
    const layout = computeLayout(result.spec);
    const compiled = compileScene(result.spec, layout);
    expect(compiled.duration).toBeGreaterThan(5);
    expect(compiled.duration).toBeLessThan(40);
    for (let t = 0; t <= compiled.duration; t += 0.5) {
      const markup = renderToStaticMarkup(<svg>{renderFrame({ scene: result.spec, layout, compiled, t, theme: DARK_THEME })}</svg>);
      expect(markup).not.toContain("NaN");
    }
  });
});

describe("validation", () => {
  const base = { schemaVersion: "2.0", type: "scene", id: "s" };
  const issues = (spec: object) => {
    const r = validateScene({ ...base, ...spec });
    return r.ok ? [] : r.issues.map((i) => `${i.path}: ${i.message}`);
  };

  it("explains mistakes in words a model can act on", () => {
    expect(issues({ elements: [{ id: "a", shape: "dot" }], steps: [{ actions: [{ do: "fadeIn", target: "b" }] }] })).toEqual(['steps.0.actions.0.target: No element has id "b"']);
    expect(issues({ elements: [{ id: "t", shape: "text", text: "x" }, { id: "c", shape: "circle", r: 1 }], steps: [{ actions: [{ do: "morph", target: "t", into: "c" }] }] })).toEqual([
      'steps.0.actions.0.target: Only outline shapes can morph; "t" is a text',
    ]);
    expect(issues({ elements: [{ id: "ax", shape: "axes", x: [0, 1, 1], y: [0, 1, 1] }, { id: "f", shape: "plot", axes: "ax", y: "x + k" }], steps: [{ actions: [] }] })).toEqual([
      'elements.1.y: Unknown name "k" in the formula; only x is defined',
    ]);
    expect(issues({ elements: [{ id: "a", shape: "dot", at: { of: "b" } }, { id: "b", shape: "dot", at: { of: "a" } }], steps: [{ actions: [] }] })[0]).toContain("loop");
    expect(issues({ schemaVersion: "1.0", elements: [{ id: "a", shape: "dot" }], steps: [{ actions: [] }] })[0]).toContain("reads 2.x");
  });

  it("parses JSON text without throwing", () => {
    expect(parseScene("{nope").ok).toBe(false);
    expect(parseScene(JSON.stringify(pythagoras)).ok).toBe(true);
  });
});

describe("ScenePlayer", () => {
  const captions = pythagoras.steps.map((s) => s.caption);
  const live = (container: HTMLElement) => container.querySelector("[aria-live=polite]")!.textContent;

  it("steps forward and back with buttons and keys, announcing captions", () => {
    const { container } = render(<ScenePlayer spec={pythagoras} />);
    expect(live(container)).toBe(captions[0]);
    fireEvent.click(screen.getByRole("button", { name: "Next step" }));
    expect(live(container)).toBe(captions[1]);
    const player = screen.getByRole("region", { name: pythagoras.title });
    fireEvent.keyDown(player, { key: "End" });
    expect(live(container)).toBe(captions.at(-1));
    fireEvent.keyDown(player, { key: "Home" });
    expect(live(container)).toBe(captions[0]);
    expect(screen.getByRole("slider", { name: "Time" }).getAttribute("aria-valuetext")).toContain(`step 1 of ${captions.length}`);
  });

  it("scrubs to any time", () => {
    const { container } = render(<ScenePlayer spec={pythagoras} />);
    const spec = parseScene(JSON.stringify(pythagoras));
    if (!spec.ok) throw new Error("invalid example");
    const s = compileScene(spec.spec, computeLayout(spec.spec));
    fireEvent.change(screen.getByRole("slider", { name: "Time" }), { target: { value: String(s.steps[2]!.start + 0.1) } });
    expect(live(container)).toBe(captions[2]);
  });

  it("plays through on its own and stops at the end", () => {
    // A frame clock we drive by hand: each frame is half a second later.
    let now = 0;
    let queued: FrameRequestCallback[] = [];
    vi.spyOn(performance, "now").mockImplementation(() => now);
    vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => queued.push(cb));
    vi.stubGlobal("cancelAnimationFrame", () => {});
    const onStepChange = vi.fn();
    render(<ScenePlayer spec={pythagoras} onStepChange={onStepChange} />);
    fireEvent.click(screen.getByRole("button", { name: "Play" }));
    for (let i = 0; i < 80; i++)
      act(() => {
        now += 500;
        const run = queued;
        queued = [];
        run.forEach((cb) => cb(now));
      });
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    expect(onStepChange).toHaveBeenLastCalledWith(captions.length - 1);
    expect(screen.getByRole("button", { name: "Replay" })).toBeTruthy();
  });

  it("jumps to a step from the transcript", () => {
    render(<ScenePlayer spec={pythagoras} />);
    fireEvent.click(screen.getByRole("button", { name: captions[3]! }));
    expect(screen.getByRole("img").getAttribute("aria-label")).toContain(captions[3]);
  });

  it("shows a safe message for bad scenes", () => {
    render(<ScenePlayer spec={{ type: "scene" }} />);
    expect(screen.getByRole("alert").textContent).toContain("couldn't be shown");
  });
});

describe("primitives", () => {
  it("show their content when motion can't be observed, and give screen readers final values", () => {
    render(
      <>
        <FadeIn>Hello</FadeIn>
        <CountUp to={1234} />
        <Typewriter text="Typed out" />
      </>,
    );
    expect(screen.getByText("Hello").style.opacity).toBe("1");
    expect(screen.getByLabelText("1,234")).toBeTruthy();
    expect(screen.getByLabelText("Typed out")).toBeTruthy();
  });
});

describe("two-pass generation", () => {
  it("offers a planning tool, a scene tool and a request per planned scene", () => {
    expect(outlineToolDefinition().inputSchema).toMatchObject({ type: "object" });
    const tool = JSON.stringify(sceneToolDefinition().inputSchema);
    expect(tool).toContain('"const":"morph"');
    expect(tool).toContain('"const":"axes"');
    const request = sceneRequest({ title: "Area", scenes: [{ title: "Unroll", summary: "Rings to triangle", weight: "short" }] }, 0);
    expect(request).toContain("Scene 1 of 1: Unroll");
    expect(request).toContain("about 3 steps");
  });
});
