/**
 * One error type for everything the CLI reports. `code` is stable and
 * machine-readable (agents branch on it); `hint` says what to do next.
 * Exit codes: 1 general, 2 usage, 3 auth, 4 not found / no access,
 * 5 plan limit, 6 network / server.
 */
export class CliError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly opts: { hint?: string; status?: number; exitCode?: number; details?: unknown } = {},
  ) {
    super(message);
    this.name = "CliError";
  }

  get hint() {
    return this.opts.hint;
  }

  get exitCode(): number {
    if (this.opts.exitCode) return this.opts.exitCode;
    switch (this.code) {
      case "USAGE":
        return 2;
      case "NOT_LOGGED_IN":
      case "UNAUTHORIZED":
        return 3;
      case "NOT_FOUND":
      case "FORBIDDEN":
        return 4;
      case "PLAN_LIMIT":
        return 5;
      case "NETWORK":
      case "SERVER_ERROR":
        return 6;
      default:
        return 1;
    }
  }

  toJSON() {
    return {
      error: {
        code: this.code,
        message: this.message,
        ...(this.hint ? { hint: this.hint } : {}),
        ...(this.opts.status ? { status: this.opts.status } : {}),
        ...(this.opts.details ? { details: this.opts.details } : {}),
      },
    };
  }
}

export const usage = (message: string, hint?: string) => new CliError(message, "USAGE", { hint });
