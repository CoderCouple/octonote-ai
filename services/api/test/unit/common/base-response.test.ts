import { describe, expect, it } from "vitest";
import {
  errorResponse,
  successResponse,
} from "../../../src/api/v1/response/base.response";

describe("base.response helpers", () => {
  it("successResponse wraps payload with success=true + default status 200", () => {
    const r = successResponse({ id: "wsp_1" });
    expect(r.success).toBe(true);
    expect(r.statusCode).toBe(200);
    expect(r.message).toBe("Success");
    expect(r.result).toEqual({ id: "wsp_1" });
  });

  it("successResponse accepts custom status + message", () => {
    const r = successResponse(null, "Created", 201);
    expect(r.statusCode).toBe(201);
    expect(r.message).toBe("Created");
    expect(r.result).toBeNull();
  });

  it("errorResponse marks success=false and carries errorCode", () => {
    const r = errorResponse("nope", 403, "FORBIDDEN", { reason: "role" });
    expect(r.success).toBe(false);
    expect(r.statusCode).toBe(403);
    expect(r.message).toBe("nope");
    expect(r.errorCode).toBe("FORBIDDEN");
    expect(r.extra).toEqual({ reason: "role" });
  });

  it("errorResponse omits extra when empty", () => {
    const r = errorResponse("x", 500);
    expect(r.extra).toBeUndefined();
  });
});
