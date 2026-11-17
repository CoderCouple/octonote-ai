import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import gallery from "../examples/gallery.json" with { type: "json" };
import { Infographic, InfographicRenderer, LAYOUTS, upgradeLegacy, validateInfographic, type InfographicSpec } from "../src/index.js";

afterEach(cleanup);

const base = { schemaVersion: "1.0", type: "infographic", id: "ig", title: "Facts" } as const;
const examples = gallery as unknown as InfographicSpec[];
const issues = (input: unknown) => {
  const r = validateInfographic(input);
  return r.ok ? [] : r.issues.map((i) => `${i.path}: ${i.message}`);
};

describe("the gallery", () => {
  it("covers every layout", () => {
    expect(new Set(examples.map((e) => e.layout))).toEqual(new Set(LAYOUTS));
  });

  it.each(examples.map((e) => [e.id, e] as const))("%s validates and renders", (_id, spec) => {
    expect(issues(spec)).toEqual([]);
    const { container } = render(<Infographic spec={spec} theme="light" />);
    expect(screen.getByRole("heading", { name: spec.title })).toBeTruthy();
    expect(container.querySelector(`.ig--${spec.layout}`)).toBeTruthy();
    // Every top-level label is on the page (charts that draw labels in SVG keep them for screen readers).
    for (const item of spec.items) expect(container.textContent).toContain(item.label);
  });
});

describe("rules", () => {
  it("checks how many items each layout takes", () => {
    expect(issues({ ...base, layout: "swot", items: [{ label: "S", children: [{ label: "a" }] }] })).toContain("items: The swot layout needs exactly 4 items.");
    expect(issues({ ...base, layout: "steps", items: Array.from({ length: 7 }, (_, i) => ({ label: `s${i}` })) })).toContain("items: The steps layout needs 2 to 6 items.");
  });

  it("only allows the styles a layout offers", () => {
    expect(issues({ ...base, layout: "grid", style: "ribbon", items: [{ label: "a" }, { label: "b" }] })).toEqual([]);
    expect(issues({ ...base, layout: "steps", style: "ribbon", items: [{ label: "a" }, { label: "b" }] })[0]).toMatch(/offers these styles: card, badge/);
    expect(issues({ ...base, layout: "pie", style: "card", items: [{ label: "a", value: 1 }, { label: "b", value: 2 }] })[0]).toMatch(/draws its own items/);
  });

  it("needs children where items nest, and numbers where they're drawn", () => {
    expect(issues({ ...base, layout: "versus", items: [{ label: "A" }, { label: "B", children: [{ label: "x" }] }] })).toEqual(["items.0.children: In the versus layout every item needs children."]);
    expect(issues({ ...base, layout: "grid", items: [{ label: "A", children: [{ label: "x" }] }, { label: "B" }] })[0]).toMatch(/doesn't nest/);
    expect(issues({ ...base, layout: "bars", items: [{ label: "A", value: 1 }, { label: "B" }] })).toEqual(["items.1.value: Every item in a bars needs a value."]);
    expect(issues({ ...base, layout: "rings", items: [{ label: "A", value: 140 }, { label: "B", value: 20 }] })).toEqual(["items.0.value: Ring values are percentages, 0 to 100."]);
  });

  it("caps text so nothing overflows, and limits nesting depth", () => {
    expect(issues({ ...base, layout: "grid", items: [{ label: "x".repeat(49) }, { label: "b" }] })[0]).toMatch(/^items\.0\.label/);
    const deep = { label: "a", children: [{ label: "b", children: [{ label: "c", children: [{ label: "d" }] }] }] };
    expect(issues({ ...base, layout: "tree", items: [deep] })).toContain("items.0: Items nest at most 3 levels deep.");
  });

  it("refuses an unknown icon", () => {
    expect(issues({ ...base, layout: "grid", items: [{ label: "a", icon: "unicorn" }, { label: "b" }] })[0]).toMatch(/^items\.0\.icon/);
  });
});

describe("infographics made before this library", () => {
  it("upgrade from the first format", () => {
    const old = {
      ...base,
      layout: "compare",
      groups: [
        { label: "SQL", color: "blue", items: [{ label: "Tables", icon: "database" }] },
        { label: "NoSQL", color: "orange", items: [{ label: "Documents", detail: "Flexible." }] },
      ],
    };
    const up = upgradeLegacy(old) as { layout: string; items: { tone: string; children: unknown[] }[] };
    expect(up.layout).toBe("versus");
    expect(up.items[0]).toMatchObject({ label: "SQL", tone: "blue", children: [{ label: "Tables", icon: "database" }] });
    expect(issues(old)).toEqual([]);
  });

  it("keep their bars, stats and steps", () => {
    expect(issues({ ...base, layout: "bars", unit: "%", items: [{ label: "A", amount: 96.5, color: "blue" }, { label: "B", amount: 1.7, value: "1.7%" }] })).toEqual([]);
    expect(issues({ ...base, layout: "stats", items: [{ label: "Users", value: "3M" }, { label: "Countries", value: "40" }] })).toEqual([]);
    expect((upgradeLegacy({ ...base, layout: "process", items: [] }) as { layout: string }).layout).toBe("steps");
    expect((upgradeLegacy({ ...base, layout: "cards", items: [] }) as { layout: string; style: string }).style).toBe("badge");
  });
});

describe("reading an infographic", () => {
  const steps = examples.find((e) => e.id === "steps")!;

  it("opens a part's detail on click, and closes it on a second click or Escape", () => {
    const { container } = render(<Infographic spec={steps} />);
    expect(screen.getByText("Click any highlighted part to learn more.")).toBeTruthy();
    const part = screen.getByRole("button", { name: /Harmless piece arrives/ });
    fireEvent.click(part);
    expect(part.getAttribute("aria-expanded")).toBe("true");
    const detail = container.querySelector(".ig__detail--on")!;
    expect(detail.textContent).toContain("antigen");
    fireEvent.click(part);
    expect(container.querySelector(".ig__detail--on")).toBeNull();
    fireEvent.click(part);
    fireEvent.keyDown(window, { key: "Escape" });
    expect(container.querySelector(".ig__detail--on")).toBeNull();
  });

  it("only makes parts with a detail into buttons", () => {
    render(<Infographic spec={steps} />);
    expect(screen.getAllByRole("button")).toHaveLength(1);
  });

  it("opens details of nested items too", () => {
    const spec = { ...base, layout: "versus" as const, items: [{ label: "A", children: [{ label: "A1", detail: "About A1." }] }, { label: "B", children: [{ label: "B1" }] }] };
    const { container } = render(<InfographicRenderer spec={spec} />);
    fireEvent.click(screen.getByRole("button", { name: /A1/ }));
    expect(container.querySelector(".ig__detail--on")!.textContent).toContain("About A1.");
  });

  it("draws bars to scale with their unit", () => {
    const { container } = render(<Infographic spec={examples.find((e) => e.id === "bars")!} />);
    const bars = [...container.querySelectorAll<HTMLElement>(".ig-bar")].map((b) => b.style.getPropertyValue("--ig-w"));
    expect(bars[0]).toBe("100%");
    expect(screen.getByText("96.5%")).toBeTruthy();
    expect(screen.getByText("0.013%")).toBeTruthy();
  });

  it("shows percentages once, with the biggest slice in a donut's middle", () => {
    const { container } = render(<Infographic spec={examples.find((e) => e.id === "donut")!} />);
    const legend = screen.getAllByRole("listitem").map((li) => li.textContent);
    expect(legend[0]).toBe("SolarFastest growing18%");
    expect(container.querySelector(".ig-pie__center")!.textContent).toBe("30%Gas");
  });

  it("shows each slice's share and the total when values aren't percentages", () => {
    const spec = { ...base, layout: "donut" as const, unit: "TWh", items: [{ label: "Solar", value: 30 }, { label: "Wind", value: 90 }] };
    const { container } = render(<InfographicRenderer spec={spec} />);
    expect(screen.getAllByRole("listitem")[0]!.textContent).toBe("Solar30 TWh25%");
    expect(container.querySelector(".ig-pie__center")!.textContent).toBe("120 TWhTotal");
  });

  it("marks checklist items done or not for screen readers", () => {
    render(<Infographic spec={examples.find((e) => e.id === "checklist")!} />);
    const press = screen.getByText("Press kit").closest("li")!;
    expect(within(press).getByText(/not done/)).toBeTruthy();
  });

  it("shows the funnel's conversion from the first stage", () => {
    render(<Infographic spec={examples.find((e) => e.id === "funnel")!} />);
    expect(screen.getByText("26% of first stage")).toBeTruthy();
  });

  it("shows what's wrong instead of crashing on a bad spec", () => {
    render(<InfographicRenderer spec={{ ...base, layout: "bars", items: [{ label: "a" }, { label: "b", value: 1 }] }} />);
    expect(screen.getByRole("alert").textContent).toContain("Every item in a bars needs a value.");
  });
});
