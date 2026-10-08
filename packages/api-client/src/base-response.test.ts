import { describe, expect, it } from "vitest";
import { actionFailure, actionSuccess } from "./action-response";
import {
  isBaseResponse,
  unwrapBaseResponse,
  type BaseResponse,
} from "./base-response";

describe("actionSuccess / actionFailure", () => {
  it("actionSuccess returns a success-narrowable union", () => {
    const r = actionSuccess({ id: "pag_1" });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data).toEqual({ id: "pag_1" });
  });

  it("actionFailure preserves message + optional errorCode", () => {
    const r = actionFailure("Boom", "NOT_FOUND");
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.message).toBe("Boom");
      expect(r.errorCode).toBe("NOT_FOUND");
    }
  });

  it("actionFailure works without an errorCode", () => {
    const r = actionFailure("Boom");
    if (!r.success) {
      expect(r.message).toBe("Boom");
      expect(r.errorCode).toBeUndefined();
    }
  });
});

describe("isBaseResponse", () => {
  it("accepts a well-formed BaseResponse", () => {
    const body: BaseResponse<number> = {
      result: 42,
      statusCode: 200,
      message: "ok",
      success: true,
    };
    expect(isBaseResponse(body)).toBe(true);
  });

  it("rejects null", () => {
    expect(isBaseResponse(null)).toBe(false);
  });

  it("rejects non-object", () => {
    expect(isBaseResponse(42)).toBe(false);
    expect(isBaseResponse("hi")).toBe(false);
  });

  it("rejects an object missing required envelope fields", () => {
    expect(isBaseResponse({ result: 1 })).toBe(false);
    expect(isBaseResponse({ success: true })).toBe(false);
  });
});

describe("unwrapBaseResponse", () => {
  it("returns the inner result for a successful envelope", () => {
    const body: BaseResponse<{ title: string }> = {
      result: { title: "hello" },
      statusCode: 200,
      message: "ok",
      success: true,
    };
    expect(unwrapBaseResponse(body, "/test")).toEqual({ title: "hello" });
  });

  it("returns the raw body when it does not look like a BaseResponse", () => {
    const raw = { title: "hello" };
    expect(unwrapBaseResponse(raw, "/legacy")).toEqual(raw);
  });

  it("throws when success is false", () => {
    const body: BaseResponse<null> = {
      result: null,
      statusCode: 404,
      message: "Not Found",
      success: false,
      errorCode: "NOT_FOUND",
    };
    expect(() => unwrapBaseResponse(body, "/pages/x")).toThrow(/NOT_FOUND/);
  });

  it("returns null when the success envelope's result is null (delete-style endpoints)", () => {
    const body: BaseResponse<null> = {
      result: null,
      statusCode: 200,
      message: "ok",
      success: true,
    };
    expect(unwrapBaseResponse(body, "/pages/x")).toBeNull();
  });
});
