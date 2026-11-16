import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import examples from "../examples/infographics.json" with { type: "json" };
import { Infographic, InfographicSpecRenderer, validateInfographic, WidgetsProvider } from "../src/index.js";

afterEach(cleanup);

const base = { schemaVersion: "1.0", type: "infographic", id: "ig", title: "Facts" };

describe("infographic schema", () => {
  it("accepts every example", () => {
    for (const spec of examples) expect(validateInfographic(spec)).toMatchObject({ ok: true });
  });

  it("needs groups for compare and items otherwise", () => {
    const compare = validateInfographic({ ...base, layout: "compare", items: [{ label: "a" }, { label: "b" }] });
    expect(compare.ok).toBe(false);
    if (!compare.ok) expect(compare.issues.map((i) => i.path)).toEqual(expect.arrayContaining(["groups", "items"]));
    expect(validateInfographic({ ...base, layout: "cards" }).ok).toBe(false);
  });

  it("needs an amount on every bar and a value on every stat", () => {
    const bars = validateInfographic({ ...base, layout: "bars", items: [{ label: "a", amount: 1 }, { label: "b" }] });
    expect(bars.ok ? [] : bars.issues.map((i) => i.path)).toEqual(["items.1.amount"]);
    const stats = validateInfographic({ ...base, layout: "stats", items: [{ label: "a", value: "1" }, { label: "b" }] });
    expect(stats.ok ? [] : stats.issues.map((i) => i.path)).toEqual(["items.1.value"]);
  });

  it("caps text so nothing overflows", () => {
    const long = validateInfographic({ ...base, layout: "cards", items: [{ label: "x".repeat(49) }, { label: "b" }] });
    expect(long.ok).toBe(false);
  });
});

describe("Infographic", () => {
  it("opens a part's detail on click and closes it again", () => {
    render(
      <WidgetsProvider>
        <Infographic spec={examples[1] as never} />
      </WidgetsProvider>,
    );
    expect(screen.getByText("Click any part to learn more.")).toBeTruthy();
    const step = screen.getByRole("button", { name: /Antibodies are made/ });
    fireEvent.click(step);
    expect(step.getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByRole("region", { name: "Antibodies are made" }).textContent).toContain("B cells");
    fireEvent.click(step);
    expect(screen.queryByRole("region", { name: "Antibodies are made" })).toBeNull();
  });

  it("draws bars to scale and shows each amount with its unit", () => {
    const { container } = render(<Infographic spec={examples[0] as never} />);
    expect(screen.getByText("96.5 %")).toBeTruthy();
    expect(screen.getByText("0.013%")).toBeTruthy();
    expect(container.querySelectorAll(".wg-ig__fill")).toHaveLength(4);
  });

  it("puts compare items under their group, and only parts with a detail are buttons", () => {
    render(<Infographic spec={examples[2] as never} />);
    expect(screen.getByRole("heading", { name: "SQL" })).toBeTruthy();
    expect(screen.getAllByRole("button")).toHaveLength(2);
  });

  it("shows what's wrong instead of crashing on a bad spec", () => {
    render(<InfographicSpecRenderer spec={{ ...base, layout: "bars", items: [{ label: "a" }, { label: "b" }] }} />);
    expect(screen.getByRole("alert").textContent).toContain("Every bar needs an amount.");
  });
});
