import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import example from "../examples/food-journey.json" with { type: "json" };
import {
  arrowEnds,
  CountUp,
  FadeIn,
  outlineToolDefinition,
  parseScene,
  ScenePlayer,
  sceneRequest,
  sceneStateAt,
  sceneToolDefinition,
  Typewriter,
  validateScene,
  wrapText,
  type Scene,
} from "../src/index.js";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const scene = example as unknown as Scene;

describe("scene validation", () => {
  it("accepts the example", () => {
    expect(validateScene(example).ok).toBe(true);
  });

  it("reports actions on missing or wrong elements", () => {
    const bad = structuredClone(example) as any;
    bad.steps[0].actions.push({ do: "count", target: "mouth", value: 3 }, { do: "show", target: "ghost" });
    bad.elements.push({ id: "a9", kind: "arrow", from: "mouth", to: "foodLabel" });
    const result = validateScene(bad);
    const messages = result.ok ? [] : result.issues.map((i) => i.message);
    expect(messages).toEqual(expect.arrayContaining(["Only counters can count", 'No element has id "ghost"', 'Arrows join boxes or circles; "foodLabel" isn\'t one']));
  });

  it("parses JSON text without throwing", () => {
    expect(parseScene("nope").ok).toBe(false);
  });
});

describe("scene state", () => {
  it("starts from the initial elements and applies steps cumulatively", () => {
    expect(sceneStateAt(scene, -1).mouth!.visible).toBe(false);
    const third = sceneStateAt(scene, 2);
    expect(third.food).toMatchObject({ x: 400, color: "orange", visible: true });
    expect(third.foodLabel!.text).toBe("chyme");
    expect(third.stomach!.highlighted).toBe(true);
    expect(third.mouth!.highlighted).toBe(false);
    expect(sceneStateAt(scene, 4).absorbed!.value).toBe(95);
  });

  it("can jump backwards, because every step is computed from the start", () => {
    expect(sceneStateAt(scene, 1).food!.x).toBe(244);
  });
});

describe("geometry", () => {
  it("joins boxes edge to edge", () => {
    const [a, b] = [scene.elements[0]!, scene.elements[1]!];
    const state = sceneStateAt(scene, 1);
    const { start, end } = arrowEnds(a, state.mouth!, b, state.oesophagus!, 0);
    expect(start).toEqual({ x: 152, y: 156 });
    expect(end).toEqual({ x: 180, y: 156 });
  });

  it("wraps labels by word", () => {
    expect(wrapText("Small intestine absorbs", 12)).toEqual(["Small", "intestine", "absorbs"]);
  });
});

describe("ScenePlayer", () => {
  it("steps forward and back with buttons and keys, announcing captions", () => {
    const { container } = render(<ScenePlayer spec={example} />);
    const caption = () => container.querySelector("[aria-live=polite]")!.textContent;
    expect(caption()).toContain("Press play");
    fireEvent.click(screen.getByRole("button", { name: "Next step" }));
    expect(caption()).toBe("1/6Digestion starts in the mouth: teeth break food apart and saliva starts on starch.");
    const player = screen.getByRole("region", { name: "The journey of a bite of food" });
    fireEvent.keyDown(player, { key: "End" });
    expect(caption()).toContain("does most of the absorbing");
    fireEvent.keyDown(player, { key: "ArrowLeft" });
    expect(caption()).toContain("large intestine takes back water");
    expect(screen.getByRole("slider", { name: "Step" }).getAttribute("aria-valuetext")).toBe("Step 5 of 6");
  });

  it("plays through on its own and stops at the end", () => {
    vi.useFakeTimers();
    const onStepChange = vi.fn();
    render(<ScenePlayer spec={example} autoPlay onStepChange={onStepChange} />);
    // One step per tick, so React can schedule the next timer in between.
    for (let i = 0; i < 10; i++) act(() => vi.advanceTimersByTime(4000));
    expect(onStepChange).toHaveBeenLastCalledWith(5);
    expect(screen.getByRole("button", { name: "Replay" })).toBeTruthy();
  });

  it("jumps to a step from the transcript", () => {
    render(<ScenePlayer spec={example} />);
    fireEvent.click(screen.getByRole("button", { name: /The stomach churns it/ }));
    expect(screen.getByRole("img").getAttribute("aria-label")).toContain("The stomach churns it");
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
    expect(JSON.stringify(sceneToolDefinition().inputSchema)).toContain('"const":"arrow"');
    const request = sceneRequest({ title: "Digestion", scenes: [{ title: "Mouth", summary: "Chewing", weight: "short" }] }, 0);
    expect(request).toContain("Scene 1 of 1: Mouth");
    expect(request).toContain("about 3 steps");
  });
});
