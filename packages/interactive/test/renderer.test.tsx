import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { memoryStore, type ActivityEvent } from "../src/index.js";
import { InteractiveProvider, InteractiveRenderer, useActivityEmitter, useControllableState, type ActivityComponents, type ActivityRenderProps } from "../src/index.js";
import digestive from "../examples/digestive-system.json" with { type: "json" };

afterEach(cleanup);

const flashcards = digestive.activities[0];

/** A stand-in activity: counts clicks and completes on demand. */
function Counter({ spec, onEvent, defaultState, onStateChange }: ActivityRenderProps<any, number>) {
  const [count, setCount] = useControllableState(undefined, defaultState ?? 0, onStateChange);
  const emit = useActivityEmitter(spec.id, spec.type, onEvent);
  return (
    <div>
      <p>
        {spec.id}: {count}
      </p>
      <button onClick={() => setCount((c) => c + 1)}>Add to {spec.id}</button>
      <button onClick={() => emit({ type: "activity.completed", score: { earned: 1, possible: 1, percent: 100 } })}>Finish {spec.id}</button>
    </div>
  );
}

function Crash(): never {
  throw new Error("boom");
}

const components: ActivityComponents = { flashcards: Counter, mindmap: Counter, matching: Counter, mcq: Counter, quiz: Counter };

describe("InteractiveRenderer", () => {
  it("renders a valid activity with the registered component", () => {
    render(<InteractiveRenderer spec={flashcards} components={components} />);
    expect(screen.getByText("organs-cards: 0")).toBeTruthy();
  });

  it("shows a safe message and reports invalid specs", () => {
    const onEvent = vi.fn();
    render(<InteractiveRenderer spec={{ ...flashcards, cards: [] }} components={components} onEvent={onEvent} />);
    expect(screen.getByRole("alert").textContent).toContain("couldn't be shown");
    expect(screen.getByText("cards")).toBeTruthy();
    expect(onEvent).toHaveBeenCalledWith(expect.objectContaining({ type: "spec.invalid", activityId: "organs-cards", activityType: "flashcards" }));
  });

  it("uses a custom fallback", () => {
    render(<InteractiveRenderer spec="garbage" fallback={(issues) => <p>{issues.length} problem</p>} />);
    expect(screen.getByText("1 problem")).toBeTruthy();
  });

  it("tells developers when a type has no component", () => {
    render(<InteractiveRenderer spec={flashcards} />);
    expect(screen.getByRole("alert").textContent).toContain("No component for “flashcards”");
  });

  it("contains a crashing activity", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    render(<InteractiveRenderer spec={flashcards} components={{ flashcards: Crash }} />);
    expect(screen.getByRole("alert").textContent).toContain("Something went wrong");
    expect(screen.getByRole("button", { name: "Try again" })).toBeTruthy();
  });

  it("sends events to both the renderer and the provider, once each", async () => {
    const fromProvider: ActivityEvent[] = [];
    const fromRenderer: ActivityEvent[] = [];
    render(
      <InteractiveProvider components={components} onEvent={(e) => fromProvider.push(e)}>
        <InteractiveRenderer spec={flashcards} onEvent={(e) => fromRenderer.push(e)} />
      </InteractiveProvider>,
    );
    await userEvent.click(screen.getByText("Finish organs-cards"));
    const types = (events: ActivityEvent[]) => events.map((e) => e.type);
    expect(types(fromProvider)).toEqual(["activity.started", "activity.completed"]);
    expect(types(fromRenderer)).toEqual(types(fromProvider));
    expect(fromRenderer[1]).toMatchObject({ activityId: "organs-cards", activityType: "flashcards" });
  });
});

describe("sessions", () => {
  it("moves between activities and keeps their state", async () => {
    render(<InteractiveRenderer spec={digestive} components={components} />);
    await userEvent.click(screen.getByText("Add to organs-cards"));
    await userEvent.click(screen.getByRole("button", { name: "Next activity" }));
    expect(screen.getByText("tract-map: 0")).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: /Key terms/ }));
    expect(screen.getByText("organs-cards: 1")).toBeTruthy();
  });

  it("counts completed activities", async () => {
    render(<InteractiveRenderer spec={digestive} components={components} />);
    await userEvent.click(screen.getByText("Finish organs-cards"));
    expect(screen.getByText("1 of 5 activities completed")).toBeTruthy();
    expect(screen.getByRole("progressbar").getAttribute("aria-valuenow")).toBe("1");
  });
});

describe("persistence", () => {
  it("saves state and completion, and restores them", async () => {
    const store = memoryStore();
    const first = render(<InteractiveRenderer spec={digestive} components={components} store={store} />);
    await userEvent.click(await screen.findByText("Add to organs-cards"));
    await userEvent.click(screen.getByText("Finish organs-cards"));
    expect(store.load("digestive-system/organs-cards")).toMatchObject({ status: "completed", attempts: 1, state: 1, score: { percent: 100 } });
    first.unmount();

    render(<InteractiveRenderer spec={digestive} components={components} store={store} />);
    expect(await screen.findByText("organs-cards: 1")).toBeTruthy();
    await waitFor(() => expect(screen.getByText("1 of 5 activities completed")).toBeTruthy());
  });

  it("ignores saved progress from a different activity type", async () => {
    const store = memoryStore({ "organs-cards": { activityId: "organs-cards", activityType: "quiz", status: "completed", attempts: 1, state: 99, updatedAt: 0 } });
    render(<InteractiveRenderer spec={flashcards} components={components} store={store} />);
    expect(await screen.findByText("organs-cards: 0")).toBeTruthy();
  });
});
