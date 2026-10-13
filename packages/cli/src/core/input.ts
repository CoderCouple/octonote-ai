/**
 * Reading content: from a file, or from stdin with "-" / --stdin. Never
 * prompts — an agent's process must not hang waiting for input.
 */
import { readFile } from "node:fs/promises";
import { usage } from "./errors.js";

export async function readStdin(): Promise<string> {
  if (process.stdin.isTTY) {
    throw usage("Nothing on stdin.", "Pipe content in (e.g. `cat note.md | octonote note create --stdin`) or pass --file.");
  }
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString("utf8");
}

/** `--file path` (or "-" for stdin), `--stdin`, or nothing. */
export async function readContent(opts: { file?: string; stdin?: boolean }): Promise<string | null> {
  if (opts.stdin || opts.file === "-") return readStdin();
  if (!opts.file) return null;
  try {
    return await readFile(opts.file, "utf8");
  } catch {
    throw usage(`Can't read ${opts.file}.`);
  }
}
