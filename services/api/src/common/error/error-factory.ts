/**
 * Convenience constructors for the most common API errors. Services and
 * controllers should always throw via these helpers (or AppError directly)
 * instead of Nest's built-in NotFoundException / ForbiddenException etc.,
 * so every error has a stable `code` for the client.
 */
import { HttpStatus } from "@nestjs/common";
import { AppError } from "./app-error";
import { ErrorCode } from "./error-codes";

export const NotFound = (message: string, extra?: Record<string, unknown>) =>
  new AppError(ErrorCode.NOT_FOUND, message, HttpStatus.NOT_FOUND, extra);

export const Forbidden = (message: string, extra?: Record<string, unknown>) =>
  new AppError(ErrorCode.FORBIDDEN, message, HttpStatus.FORBIDDEN, extra);

export const BadRequest = (message: string, extra?: Record<string, unknown>) =>
  new AppError(ErrorCode.INVALID_REQUEST, message, HttpStatus.BAD_REQUEST, extra);

export const Unauthorized = (message: string, extra?: Record<string, unknown>) =>
  new AppError(ErrorCode.UNAUTHORIZED, message, HttpStatus.UNAUTHORIZED, extra);

export const Conflict = (message: string, extra?: Record<string, unknown>) =>
  new AppError(ErrorCode.CONFLICT, message, HttpStatus.CONFLICT, extra);

export const ValidationError = (message: string, extra?: Record<string, unknown>) =>
  new AppError(
    ErrorCode.VALIDATION_ERROR,
    message,
    HttpStatus.UNPROCESSABLE_ENTITY,
    extra,
  );

export const ServerError = (message: string, extra?: Record<string, unknown>) =>
  new AppError(
    ErrorCode.SERVER_ERROR,
    message,
    HttpStatus.INTERNAL_SERVER_ERROR,
    extra,
  );
