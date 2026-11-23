/**
 * Waiting for work Octonote does in the background (Studio items, videos):
 * poll until `done` says so, reporting progress on stderr. Gives up after
 * `timeoutMs` with a TIMEOUT error that says how to check again later.
 */
import { CliError } from "./errors.js";
import { info } from "./output.js";

export async function waitFor<T>(
  poll: () => Promise<T>,
  opts: {
    done: (value: T) => boolean;
    progress?: (value: T) => string;
    /** The command to check again later, for the timeout hint. */
    checkWith: string;
    intervalMs?: number;
    timeoutMs?: number;
  },
): Promise<T> {
  const started = Date.now();
  let last = "";
  for (;;) {
    const value = await poll();
    if (opts.done(value)) return value;
    const line = opts.progress?.(value) ?? "";
    if (line && line !== last) info(line);
    last = line;
    if (Date.now() - started > (opts.timeoutMs ?? 10 * 60_000)) {
      throw new CliError("Still working on it.", "TIMEOUT", {
        hint: `It carries on in Octonote; check later with \`${opts.checkWith}\`.`,
      });
    }
    await new Promise((r) => setTimeout(r, opts.intervalMs ?? 3000));
  }
}
