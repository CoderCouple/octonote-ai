import { describe, expect, it } from "vitest";
import { AppError } from "../../../src/common/error/app-error";
import { ErrorCode } from "../../../src/common/error/error-codes";
import {
  BadRequest,
  Conflict,
  Forbidden,
  NotFound,
  ServerError,
  Unauthorized,
  ValidationError,
} from "../../../src/common/error/error-factory";

describe("error-factory", () => {
  it("NotFound emits AppError with 404 + NOT_FOUND code", () => {
    const err = NotFound("missing");
    expect(err).toBeInstanceOf(AppError);
    expect(err.getStatus()).toBe(404);
    expect(err.code).toBe(ErrorCode.NOT_FOUND);
    expect(err.message).toBe("missing");
    expect(err.extra).toEqual({});
  });

  it("Forbidden emits 403 + FORBIDDEN with extra payload", () => {
    const err = Forbidden("nope", { resource: "page" });
    expect(err.getStatus()).toBe(403);
    expect(err.code).toBe(ErrorCode.FORBIDDEN);
    expect(err.extra).toEqual({ resource: "page" });
  });

  it.each([
    [BadRequest, ErrorCode.INVALID_REQUEST, 400],
    [Unauthorized, ErrorCode.UNAUTHORIZED, 401],
    [Conflict, ErrorCode.CONFLICT, 409],
    [ValidationError, ErrorCode.VALIDATION_ERROR, 422],
    [ServerError, ErrorCode.SERVER_ERROR, 500],
  ])("%s emits %s @ %i", (factory, code, status) => {
    const err = (factory as (m: string) => AppError)("msg");
    expect(err.getStatus()).toBe(status);
    expect(err.code).toBe(code);
  });
});
