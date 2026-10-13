/**
 * Wraps every command: applies output flags, builds the context, reports
 * errors in the agreed format and sets the exit code.
 */
import type { Command } from "commander";
import { createContext, type Ctx, type GlobalFlags } from "./context.js";
import { reportError, setOutputMode } from "./output.js";

export interface Globals extends GlobalFlags {
  json?: boolean;
  pretty?: boolean;
  quiet?: boolean;
}

type Handler<A extends unknown[]> = (ctx: Ctx, ...args: A) => Promise<void>;

export function action<A extends unknown[]>(handler: Handler<A>, opts: { auth?: boolean } = {}) {
  return async (...args: unknown[]) => {
    // Commander passes (...positional, options, command).
    const command = args[args.length - 1] as Command;
    const globals = command.optsWithGlobals() as Globals;
    setOutputMode(globals);
    try {
      const ctx = await createContext(globals, { requireAuth: opts.auth !== false });
      await handler(ctx, ...(args.slice(0, -1) as A));
    } catch (err) {
      process.exitCode = reportError(err);
    }
  };
}
