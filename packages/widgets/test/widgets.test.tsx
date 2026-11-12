import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import guide from "../examples/digestive-guide.json" with { type: "json" };
import {
  Accordion,
  Button,
  Dialog,
  documentToolDefinition,
  parseDocument,
  parseInline,
  RichText,
  Switch,
  Tabs,
  ToastProvider,
  Tooltip,
  useToast,
  validateDocument,
  WidgetRenderer,
  WidgetsProvider,
} from "../src/index.js";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("documents", () => {
  it("validates the example and renders every block", () => {
    expect(validateDocument(guide).ok).toBe(true);
    render(<WidgetRenderer spec={guide} />);
    expect(screen.getByRole("heading", { level: 1, name: "How digestion works" })).toBeTruthy();
    expect(screen.getByRole("complementary", { name: "Tip" })).toBeTruthy();
    expect(screen.getByRole("region", { name: "The journey of a bite of food" })).toBeTruthy();
    expect(screen.getByRole("table")).toBeTruthy();
    expect(screen.getAllByRole("tab")).toHaveLength(3);
    expect(screen.getByRole("progressbar", { name: "Chapter progress" }).getAttribute("aria-valuenow")).toBe("60");
    expect(screen.getByRole("region", { name: "Key takeaway" })).toBeTruthy();
  });

  it("shows a safe message for invalid documents and reports why", async () => {
    const onInvalid = vi.fn();
    render(<WidgetRenderer spec={{ ...guide, blocks: [{ type: "marquee", text: "hi" }] }} onInvalid={onInvalid} />);
    expect(screen.getByRole("alert").textContent).toContain("couldn't be shown");
    expect(onInvalid).toHaveBeenCalledWith([expect.objectContaining({ path: "blocks.0.type" })]);
  });

  it("does not allow containers inside containers", () => {
    const nested = { schemaVersion: "1.0", type: "document", id: "d", blocks: [{ type: "tabs", tabs: [{ label: "A", blocks: [{ type: "tabs", tabs: [] }] }] }] };
    expect(validateDocument(nested).ok).toBe(false);
  });

  it("parses JSON text safely", () => {
    expect(parseDocument("{oops").ok).toBe(false);
    expect(parseDocument(JSON.stringify(guide)).ok).toBe(true);
  });

  it("offers a tool definition with a JSON Schema", () => {
    const tool = documentToolDefinition();
    expect(tool.inputSchema).toMatchObject({ type: "object" });
    expect(JSON.stringify(tool.inputSchema)).toContain('"const":"comparison"');
  });
});

describe("rich text", () => {
  it("parses the inline subset", () => {
    expect(parseInline("a **b** *c* `d` $x^2$")).toEqual([
      { kind: "text", text: "a " },
      { kind: "strong", children: [{ kind: "text", text: "b" }] },
      { kind: "text", text: " " },
      { kind: "em", children: [{ kind: "text", text: "c" }] },
      { kind: "text", text: " " },
      { kind: "code", text: "d" },
      { kind: "text", text: " " },
      { kind: "math", tex: "x^2" },
    ]);
  });

  it("treats money as text, not maths", () => {
    expect(parseInline("costs $5 and $10")).toEqual([{ kind: "text", text: "costs $5 and $10" }]);
  });

  it("never renders HTML or unsafe links", () => {
    const { container } = render(<RichText text={'<img src=x onerror=alert(1)> [click](javascript:alert(1)) [ok](https://example.com)'} />);
    expect(container.querySelector("img")).toBeNull();
    expect(container.textContent).toContain("<img src=x onerror=alert(1)>");
    const links = container.querySelectorAll("a");
    expect(links).toHaveLength(1);
    expect(links[0]!.getAttribute("href")).toBe("https://example.com/");
    expect(links[0]!.getAttribute("rel")).toContain("noopener");
  });

  it("uses the provider's math renderer", () => {
    render(
      <WidgetsProvider renderMath={(tex) => <span data-testid="math">{tex.toUpperCase()}</span>}>
        <RichText text="Area is $pi r^2$" />
      </WidgetsProvider>,
    );
    expect(screen.getByTestId("math").textContent).toBe("PI R^2");
  });
});

describe("controls", () => {
  it("tabs follow the ARIA pattern with arrow keys", async () => {
    render(<Tabs label="Food" items={["A", "B", "C"].map((label) => ({ label, content: <p>Panel {label}</p> }))} />);
    const [a, , c] = screen.getAllByRole("tab");
    expect(a!.getAttribute("aria-selected")).toBe("true");
    a!.focus();
    fireEvent.keyDown(a!, { key: "ArrowLeft" });
    expect(document.activeElement).toBe(c);
    expect(screen.getByRole("tabpanel").textContent).toBe("Panel C");
  });

  it("accordion opens one item at a time unless told otherwise", async () => {
    render(<Accordion items={[{ title: "One", content: "1" }, { title: "Two", content: "2" }]} />);
    const [one, two] = screen.getAllByRole("button");
    await userEvent.click(one!);
    expect(one!.getAttribute("aria-expanded")).toBe("true");
    await userEvent.click(two!);
    expect(one!.getAttribute("aria-expanded")).toBe("false");
    expect(two!.getAttribute("aria-expanded")).toBe("true");
  });

  it("loading buttons are busy and can't be clicked", async () => {
    const onClick = vi.fn();
    render(<Button loading onClick={onClick}>Save</Button>);
    const button = screen.getByRole("button", { name: "Save" });
    expect(button.getAttribute("aria-busy")).toBe("true");
    await userEvent.click(button);
    expect(onClick).not.toHaveBeenCalled();
  });

  it("switch reports its state", async () => {
    const onChange = vi.fn();
    render(<Switch checked={false} onChange={onChange} label="Dark mode" />);
    await userEvent.click(screen.getByRole("switch", { name: "Dark mode" }));
    expect(onChange).toHaveBeenCalledWith(true);
  });

  it("tooltip appears on focus and hides on Escape", () => {
    render(
      <Tooltip content="More about villi">
        <button>Villi</button>
      </Tooltip>,
    );
    const trigger = screen.getByRole("button");
    fireEvent.focus(trigger);
    expect(screen.getByRole("tooltip").textContent).toBe("More about villi");
    fireEvent.keyDown(trigger, { key: "Escape" });
    expect(screen.queryByRole("tooltip")).toBeNull();
  });

  it("dialog opens, names itself and closes", async () => {
    const onClose = vi.fn();
    const { rerender } = render(
      <Dialog open title="Delete card?" onClose={onClose}>
        This can't be undone.
      </Dialog>,
    );
    const dialog = screen.getByRole("dialog", { name: "Delete card?" });
    expect(dialog.hasAttribute("open")).toBe(true);
    await userEvent.click(within(dialog).getByRole("button", { name: "Close" }));
    expect(onClose).toHaveBeenCalled();
    rerender(
      <Dialog open={false} title="Delete card?" onClose={onClose}>
        This can't be undone.
      </Dialog>,
    );
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("toasts are announced and disappear on their own", () => {
    vi.useFakeTimers();
    function Saver() {
      const toast = useToast();
      return <button onClick={() => toast({ title: "Saved", tone: "success", duration: 1000 })}>Save</button>;
    }
    render(
      <ToastProvider>
        <Saver />
      </ToastProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(screen.getByRole("status").textContent).toContain("Saved");
    act(() => vi.advanceTimersByTime(1100));
    expect(screen.getByRole("status").textContent).toBe("");
  });
});
