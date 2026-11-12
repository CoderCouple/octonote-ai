import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import examples from "../examples/explorables.json" with { type: "json" };
import {
  computeScope,
  evaluateFormula,
  formatNumber,
  FormulaError,
  niceTicks,
  parseFormula,
  renderTemplate,
  sampleChart,
  validateDocument,
  solveInput,
  validateWidget,
  WidgetSpecRenderer,
  type WidgetSpec,
} from "../src/index.js";

afterEach(cleanup);

// jsdom has no PointerEvent; a MouseEvent carries the same position and button.
if (typeof window.PointerEvent === "undefined") {
  window.PointerEvent = class extends MouseEvent {
    pointerId = 1;
  } as unknown as typeof PointerEvent;
}

const byId = (id: string) => examples.find((e) => e.id === id) as unknown as WidgetSpec;
const slider = (name: string) => screen.getByRole("slider", { name }) as HTMLInputElement;
const drag = (name: string, value: number) => fireEvent.change(slider(name), { target: { value: String(value) } });

describe("formulas", () => {
  it.each([
    ["1 + 2 * 3", 7],
    ["(1 + 2) * 3", 9],
    ["2^3^2", 512],
    ["-2^2", -4],
    ["2^-1", 0.5],
    ["10 % 4", 2],
    ["3 > 2 && 1 < 0", 0],
    ["!0 || 0", 1],
    ["x > 1 ? 10 : 20", 10],
    ["round(pi, 2)", 3.14],
    ["max(1, 5, 3) + min(4, 2)", 7],
    ["clamp(15, 0, 10)", 10],
    ["gcd(12, 18)", 6],
    ["log(1000)", 3],
    ["1e3 + .5", 1000.5],
  ])("%s = %d", (formula, expected) => {
    expect(evaluateFormula(formula, { x: 2 })).toBeCloseTo(expected);
  });

  it("returns NaN instead of infinities and unknown names", () => {
    expect(evaluateFormula("1 / 0", {})).toBeNaN();
    expect(evaluateFormula("nope + 1", {})).toBeNaN();
  });

  it.each([
    ["1 +", "Formula ends too early"],
    ["(1 + 2", 'Expected ")"'],
    ["foo(1)", 'Unknown function "foo"'],
    ["round(1, 2, 3)", "round() takes 1 to 2 arguments"],
    ["a.b", 'Unexpected "."'],
    ["alert('x')", "Unexpected \"'\""],
    ["constructor(1)", 'Unknown function "constructor"'],
  ])("rejects %s", (formula, message) => {
    expect(() => parseFormula(formula)).toThrow(new FormulaError(message));
  });

  it("can't reach anything outside its scope", () => {
    for (const name of ["constructor", "__proto__", "toString", "valueOf"]) {
      expect(evaluateFormula(`${name} + 1`, {})).toBeNaN();
    }
  });

  it("refuses very long or deeply nested formulas", () => {
    expect(() => parseFormula("1+".repeat(300) + "1")).toThrow(FormulaError);
    expect(() => parseFormula("(".repeat(50) + "1" + ")".repeat(50))).toThrow("nested too deeply");
  });
});

describe("formats and templates", () => {
  it("formats numbers", () => {
    expect(formatNumber(2758.96, { style: "currency" })).toBe("$2,759");
    expect(formatNumber(0.583, { style: "percent", decimals: 1 })).toBe("58.3%");
    expect(formatNumber(7, { suffix: "%" })).toBe("7%");
    expect(formatNumber(1500, { style: "currency", signed: true })).toBe("+$1,500");
    expect(formatNumber(NaN)).toBe("—");
  });

  it("fills templates", () => {
    expect(renderTemplate("y = {m}x + 1, gain {g|currency}, share {s|percent}", { m: 2, g: 1759.4, s: 0.35 })).toBe("y = 2x + 1, gain $1,759, share 35%");
  });
});

describe("widget validation", () => {
  it.each(examples.map((e) => [e.id, e] as const))("%s is valid", (_id, spec) => {
    const result = validateWidget(spec);
    expect(result.ok || result.issues).toBe(true);
  });

  it("reports unknown names, bad formulas and ranges with paths", () => {
    const spec = structuredClone(byId("compound-simulator")) as any;
    spec.values.push({ name: "later", formula: "balance * ratee" });
    spec.inputs[0].value = 99;
    spec.views[1].series[0].y = "1000 * (1 + rate/100)^";
    spec.views.push({ type: "input", input: "missing" });
    const result = validateWidget(spec);
    const issues = result.ok ? [] : result.issues.map((i) => `${i.path}: ${i.message}`);
    expect(issues).toEqual(
      expect.arrayContaining([
        'values.1.formula: Unknown name "ratee"',
        "inputs.0.value: value must be between min and max",
        "views.1.series.0.y: Formula ends too early",
        'views.2.input: No input has id "missing"',
      ]),
    );
  });

  it("only lets values use what comes before them, so there are no cycles", () => {
    const spec = { ...byId("compound-interest"), values: [{ name: "a", formula: "b + 1" }, { name: "b", formula: "a + 1" }] };
    const result = validateWidget(spec);
    expect(result.ok || result.issues[0]!.message).toBe('Unknown name "b"');
  });

  it("refuses reserved names", () => {
    const spec = structuredClone(byId("compound-interest")) as any;
    spec.inputs[0].id = "constructor";
    expect(validateWidget(spec).ok).toBe(false);
  });

  it("caps chart points", () => {
    const spec = structuredClone(byId("linear-function")) as any;
    spec.views[1].x.step = 0.001;
    expect(validateWidget(spec).ok).toBe(false);
  });

  it("can sit inside a content document", () => {
    const { schemaVersion: _v, ...widget } = byId("budget");
    expect(validateDocument({ schemaVersion: "1.0", type: "document", id: "d", blocks: [{ type: "paragraph", text: "Try it:" }, widget] }).ok).toBe(true);
  });
});

describe("runtime", () => {
  it("computes values in order and samples charts up to xTo", () => {
    const spec = byId("compound-simulator");
    const scope = computeScope(spec, { rate: 3, years: 12 });
    expect(Math.round(scope.balance!)).toBe(1426);
    const points = sampleChart(spec.views[1] as any, scope);
    expect(points).toHaveLength(13);
    expect(points[12]!.ys[0]).toBeCloseTo(scope.balance!);
  });

  it("picks round chart ticks", () => {
    expect(niceTicks(0, 1426)).toEqual([0, 500, 1000, 1500]);
    expect(niceTicks(-9, 11)).toEqual([-10, -5, 0, 5, 10, 15]);
  });
});

describe("widgets in the page", () => {
  it("compound interest updates as the rate changes", () => {
    render(<WidgetSpecRenderer spec={byId("compound-interest")} />);
    expect(screen.getByText("$2,759")).toBeTruthy();
    expect(screen.getByText("+$1,759 earned")).toBeTruthy();
    drag("Annual return", 10);
    expect(slider("Annual return").getAttribute("aria-valuetext")).toBe("10%");
    expect(screen.getByText("$4,177")).toBeTruthy();
  });

  it("the simulator chart follows the years slider and reads values from the keyboard", () => {
    const { container } = render(<WidgetSpecRenderer spec={byId("compound-simulator")} />);
    expect(screen.getAllByText("$1,426")[0]!.closest("dd")).toBeTruthy();
    drag("Years invested", 20);
    const chart = screen.getByRole("group", { name: /line chart of Investment balance and Initial investment/ });
    fireEvent.keyDown(chart, { key: "End" });
    const tip = within(chart).getByRole("status");
    expect(tip.textContent).toContain("20");
    expect(tip.textContent).toContain("Investment balance: $1,806");
    expect(container.querySelectorAll("table tbody tr")).toHaveLength(21);
  });

  it("circle, fraction grid, donut and meter respond", () => {
    render(
      <>
        <WidgetSpecRenderer spec={byId("circle-geometry")} />
        <WidgetSpecRenderer spec={byId("fraction-explorer")} />
        <WidgetSpecRenderer spec={byId("probability")} />
        <WidgetSpecRenderer spec={byId("speed-distance")} />
      </>,
    );
    expect(screen.getByText("78.5")).toBeTruthy();
    drag("Radius", 10);
    expect(screen.getByText("314.2")).toBeTruthy();

    expect(screen.getByRole("slider", { name: /^Filled sections \(drag/ }).getAttribute("aria-valuetext")).toBe("7 of 12 filled");
    expect(screen.getByText("7/12")).toBeTruthy();
    expect(screen.getByText("58.3%")).toBeTruthy();

    drag("Success probability", 80);
    expect(screen.getByRole("img", { name: "Expected successes: 80%" })).toBeTruthy();

    drag("Speed", 90);
    expect(screen.getByText("180 km")).toBeTruthy();
    expect(screen.getByRole("slider", { name: /^Speed \(drag/ }).getAttribute("aria-valuetext")).toBe("90 km/h");
  });

  it("budget segments always add up", () => {
    render(<WidgetSpecRenderer spec={byId("budget")} />);
    drag("Monthly housing cost", 2000);
    expect(screen.getByRole("img").getAttribute("aria-label")).toBe("Housing $2,000, Remaining $1,000");
  });

  it("linear function formula follows the slope", () => {
    render(<WidgetSpecRenderer spec={byId("linear-function")} />);
    expect(screen.getByText("y = 2x + 1")).toBeTruthy();
    drag("Slope (m)", -1.5);
    expect(screen.getByText("y = -1.5x + 1")).toBeTruthy();
  });

  it("question bank follows the difficulty slider, reveals and moves on", () => {
    render(<WidgetSpecRenderer spec={byId("adaptive-questions")} />);
    expect(slider("Difficulty level").getAttribute("aria-valuetext")).toBe("Easy");
    expect(screen.getByText("What is 7 + 5?")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Reveal answer" }));
    expect(screen.getByText("12")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Next question" }));
    expect(screen.getByText("What is 12 × 8?")).toBeTruthy();
    drag("Difficulty level", 2);
    expect(screen.getByText("Question 1 of 2")).toBeTruthy();
    expect(screen.getByText("Solve x² − 5x + 6 = 0.")).toBeTruthy();
  });

  it("shows a safe message for an invalid widget", () => {
    render(<WidgetSpecRenderer spec={{ type: "widget" }} />);
    expect(screen.getByRole("alert").textContent).toContain("couldn't be shown");
  });
});

describe("direct manipulation", () => {
  const spec = (extra: object) => ({ schemaVersion: "1.0", type: "widget", id: "w", title: "W", ...extra });
  const issues = (extra: object) => {
    const r = validateWidget(spec(extra));
    return r.ok ? [] : r.issues.map((i) => `${i.path}: ${i.message}`);
  };

  it("checks handles, drags and sentences", () => {
    const inputs = [
      { kind: "slider", id: "m", label: "m", min: 0, max: 5, value: 1 },
      { kind: "toggle", id: "on", label: "On", value: true },
    ];
    expect(issues({ inputs, views: [{ type: "chart", x: { from: 0, to: 5 }, series: [{ label: "y", y: "m*x" }], handles: [{ input: "m", x: "1", y: "2" }] }] })).toEqual([
      `views.0.handles.0: The handle's x and y don't depend on "m", so dragging it can't change anything`,
    ]);
    expect(issues({ inputs, views: [{ type: "circle", radius: "m", max: 5, drag: "on" }] })).toEqual(['views.0.drag: "on" is a toggle; only sliders and selects can be dragged']);
    expect(issues({ inputs, views: [{ type: "sentence", text: "Set [m] and [nope]: {m * 2}" }] })).toEqual([
      'views.0.text: No input has id "nope" (inputs go in [brackets], live values in {braces})',
    ]);
    // A handle may follow its input through a named value.
    expect(issues({ inputs, values: [{ name: "top", formula: "m + 1" }], views: [{ type: "chart", x: { from: 0, to: 5 }, series: [{ label: "y", y: "x" }], handles: [{ input: "m", x: "1", y: "top" }] }] })).toEqual([]);
  });

  it("works out an input from where something was dragged, for any formula", () => {
    const runtime = {
      spec: { inputs: [{ kind: "slider" as const, id: "a", label: "a", min: -3, max: 3, step: 0.1, value: 1 }], values: [{ name: "y", formula: "a^2" }] },
      inputs: { a: 1 },
      scope: { a: 1, y: 1 },
      setInput: () => {},
    };
    // The point on y = x² nearest to (2, 4) is at a = 2.
    expect(solveInput(runtime, "a", (s) => Math.hypot(s.a! - 2, s.y! - 4))).toBe(2);
    expect(solveInput(runtime, "a", (s) => Math.abs(s.y! - 2.25))).toBe(-1.5);
  });

  it("sentences show inputs inline: arrow keys change them and the text follows", () => {
    render(<WidgetSpecRenderer spec={byId("investment-sentence")} />);
    const sentence = () => document.querySelector(".wg-sentence")!.textContent;
    expect(sentence()).toContain("If you invest $1,000 at 7% a year for 15 years, you'll end up with $2,759");
    const rate = screen.getByRole("slider", { name: "Annual return" });
    fireEvent.keyDown(rate, { key: "ArrowRight" });
    expect(sentence()).toContain("at 7.5% a year");
    fireEvent.keyDown(rate, { key: "End" });
    expect(sentence()).toContain("at 15% a year");
    // Inputs in a sentence don't get a second control, unless placed: years is.
    expect(screen.queryAllByRole("slider", { name: "Annual return" })).toHaveLength(1);
    expect(screen.getAllByRole("slider", { name: "Years" })).toHaveLength(2);
  });

  it("dragging a sentence number steps through its values", () => {
    render(<WidgetSpecRenderer spec={byId("investment-sentence")} />);
    const years = screen.getAllByRole("slider", { name: "Years" }).find((el) => el.tagName === "SPAN")!;
    fireEvent.pointerDown(years, { clientX: 100, button: 0 });
    fireEvent.pointerMove(years, { clientX: 100 + 6.2 * 5 });
    fireEvent.pointerUp(years, { clientX: 131 });
    expect(years.getAttribute("aria-valuetext")).toBe("20");
  });

  it("clicking a grid cell fills up to it", () => {
    render(<WidgetSpecRenderer spec={byId("fraction-explorer")} />);
    const cell = document.querySelector("[data-cell='2']")!;
    fireEvent.pointerDown(cell, { button: 0 });
    fireEvent.pointerUp(cell);
    expect(screen.getByText("3/12")).toBeTruthy();
  });

  it("chart handles are keyboard sliders too", () => {
    render(<WidgetSpecRenderer spec={byId("tangent-slope")} />);
    const handle = screen.getByRole("slider", { name: /^Point at x \(drag/ });
    fireEvent.keyDown(handle, { key: "ArrowRight" });
    expect(document.querySelector(".wg-sentence")!.textContent).toContain("At x = 1.1, the curve rises 2.2");
  });

  it("reset puts every input back", () => {
    render(<WidgetSpecRenderer spec={byId("compound-interest")} />);
    expect(screen.queryByRole("button", { name: "Reset" })).toBeNull();
    drag("Annual return", 10);
    fireEvent.click(screen.getByRole("button", { name: "Reset" }));
    expect(slider("Annual return").value).toBe("7");
    expect(screen.queryByRole("button", { name: "Reset" })).toBeNull();
  });

  it("play sweeps a slider to its end", () => {
    let now = 0;
    let queued: FrameRequestCallback[] = [];
    vi.spyOn(performance, "now").mockImplementation(() => now);
    vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => queued.push(cb));
    vi.stubGlobal("cancelAnimationFrame", () => {});
    render(<WidgetSpecRenderer spec={byId("compound-simulator")} />);
    fireEvent.click(screen.getByRole("button", { name: "Play years invested" }));
    for (let i = 0; i < 40; i++)
      act(() => {
        now += 250;
        const run = queued;
        queued = [];
        run.forEach((cb) => cb(now));
      });
    expect(slider("Years invested").value).toBe("30");
    expect(screen.getByRole("button", { name: "Play years invested" })).toBeTruthy();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });
});
