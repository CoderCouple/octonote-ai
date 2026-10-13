/**
 * Output rules (what agents rely on):
 *  - stdout carries only the result; progress and hints go to stderr.
 *  - JSON when stdout isn't a terminal (or with --json); readable text for
 *    people in a terminal (or with --pretty).
 *  - Errors: JSON `{ "error": { code, message, hint } }` on stdout when in
 *    JSON mode, else a readable line on stderr; non-zero exit code always.
 */
import { CliError } from "./errors.js";

export type OutputMode = "json" | "pretty";

let mode: OutputMode = process.stdout.isTTY ? "pretty" : "json";
let quiet = false;

export function setOutputMode(next: {
  json?: boolean;
  pretty?: boolean;
  quiet?: boolean;
}) {
  if (next.json) mode = "json";
  else if (next.pretty) mode = "pretty";
  quiet = Boolean(next.quiet);
}

export const outputMode = () => mode;

/** Print a result: JSON as-is, or `pretty(data)` for people. */
export function emit<T>(data: T, pretty?: (data: T) => string) {
  if (mode === "json") {
    process.stdout.write(`${JSON.stringify(data, null, 2)}\n`);
    return;
  }
  const text = pretty ? pretty(data) : JSON.stringify(data, null, 2);
  if (text) process.stdout.write(text.endsWith("\n") ? text : `${text}\n`);
}

/** Progress / notes for people, on stderr so stdout stays clean. */
export function info(message: string) {
  if (!quiet && mode === "pretty") process.stderr.write(`${message}\n`);
}

export function reportError(err: unknown): number {
  const e =
    err instanceof CliError
      ? err
      : new CliError(
          err instanceof Error ? err.message : String(err),
          "INTERNAL",
        );
  if (mode === "json") {
    process.stdout.write(`${JSON.stringify(e.toJSON(), null, 2)}\n`);
  } else {
    process.stderr.write(
      `✗ ${e.message}${e.code !== "INTERNAL" ? ` (${e.code})` : ""}\n`,
    );
    if (e.hint) process.stderr.write(`  ${e.hint}\n`);
  }
  return e.exitCode;
}

/** A plain text table for people. */
export function table(
  rows: Record<string, string>[],
  columns: string[],
): string {
  if (rows.length === 0) return "(none)";
  const widths = columns.map((c) =>
    Math.max(c.length, ...rows.map((r) => (r[c] ?? "").length)),
  );
  const line = (cells: string[]) =>
    cells
      .map((cell, i) => cell.padEnd(widths[i]!))
      .join("  ")
      .trimEnd();
  return [
    line(columns.map((c) => c.toUpperCase())),
    ...rows.map((r) => line(columns.map((c) => r[c] ?? ""))),
  ].join("\n");
}
