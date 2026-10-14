#!/usr/bin/env node
/**
 * octonote — the Octonote command-line tool, built for people and for
 * agents (Claude Code, Codex). Commands live in ./commands; shared
 * plumbing (config, HTTP, output, errors) in ./core; the agent guide in
 * ./guide. The CLI only talks to the public Octonote API.
 */
import { realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { Command } from "commander";
import { registerAgents } from "./commands/agents.js";
import { registerAuth } from "./commands/auth.js";
import { registerCanvas } from "./commands/canvas.js";
import { registerItems } from "./commands/items.js";
import { registerNote } from "./commands/note.js";
import { registerNotebook } from "./commands/notebook.js";
import { registerProject } from "./commands/project.js";
import { resolveConfig } from "./core/config.js";
import { DOCS_URL, gettingStarted } from "./guide/getting-started.js";
import { VERSION } from "./version.js";

export { VERSION } from "./version.js";

export function buildProgram() {
  const program = new Command()
    .name("octonote")
    .description(
      "Octonote from your terminal — and from Claude Code or Codex.\nAgents: run `octonote guide` first.",
    )
    .version(VERSION)
    .option("--json", "JSON output (default when piped)")
    .option("--pretty", "human output (default in a terminal)")
    .option("-q, --quiet", "no progress messages")
    .option("-w, --workspace <id>", "workspace to use (default: yours)")
    .option(
      "--api-url <url>",
      "Octonote API (default: OCTONOTE_API_URL or the hosted API)",
    )
    .option(
      "--web-url <url>",
      "Octonote web app (default: OCTONOTE_WEB_URL or https://octonote.ai)",
    )
    .showHelpAfterError("(run with --help for usage)")
    .configureOutput({
      // Usage errors: say what's wrong without dumping the full help.
      outputError: (str, write) => write(str),
    });

  // `octonote` on its own: the getting-started screen (also shown right
  // after install — the install line ends in `&& octonote`).
  program.action(async () => {
    const { token, tokenSource, email } = await resolveConfig();
    const signedInAs = token
      ? (email ?? (tokenSource === "env" ? "OCTONOTE_TOKEN" : "your account"))
      : null;
    process.stdout.write(gettingStarted({ version: VERSION, signedInAs }));
  });

  registerAuth(program);
  registerNote(program);
  registerCanvas(program);
  registerProject(program);
  registerNotebook(program);
  registerItems(program);
  registerAgents(program);
  program.addHelpText(
    "after",
    `\nGetting started (sign-in, Claude Code & Codex setup): run \`octonote\` on its own.\nAgents: \`octonote guide\`. Docs: ${DOCS_URL}`,
  );
  return program;
}

// Run only when executed (npm's bin link resolves to this file), not when imported by tests.
function isMain() {
  try {
    return (
      realpathSync(process.argv[1] ?? "") === fileURLToPath(import.meta.url)
    );
  } catch {
    return false;
  }
}
if (isMain()) {
  buildProgram()
    .parseAsync(process.argv)
    .catch((err) => {
      process.stderr.write(
        `${err instanceof Error ? err.message : String(err)}\n`,
      );
      process.exitCode = 1;
    });
}
