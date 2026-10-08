import { describe, expect, it } from "vitest";
import { runAction } from "./action";

describe("runAction", () => {
  it("returns success when the body resolves", async () => {
    const r = await runAction(async () => "hello");
    expect(r).toEqual({ success: true, data: "hello" });
  });

  it("returns failure with the Error message when the body throws an Error", async () => {
    const r = await runAction(async () => {
      throw new Error("nope");
    });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.message).toBe("nope");
  });

  it("returns failure with a generic message when the body throws a non-Error", async () => {
    const r = await runAction(async () => {
      throw "string error";
    });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.message).toBe("Unknown error");
  });

  it("awaits a sync return inside the async fn", async () => {
    const r = await runAction(async () => 42);
    if (r.success) expect(r.data).toBe(42);
  });
});
