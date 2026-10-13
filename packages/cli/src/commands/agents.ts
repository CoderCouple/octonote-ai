/**
 * Teaching agents the CLI: `octonote guide` prints the guide; `octonote
 * setup claude|codex` writes a short section into the project's CLAUDE.md
 * or AGENTS.md (between markers, so re-running updates it in place) and,
 * for Claude, can install a skill.
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import type { Command } from "commander";
import { usage } from "../core/errors.js";
import { emit } from "../core/output.js";
import { action } from "../core/run.js";
import { AGENT_GUIDE, CLAUDE_SKILL, PROJECT_SECTION } from "../guide/agent-guide.js";

const START = "<!-- octonote:start -->";
const END = "<!-- octonote:end -->";

/** Insert or replace the marked Octonote section; returns the new text. */
export function upsertSection(existing: string, section: string): string {
  const block = `${START}\n${section.trim()}\n${END}`;
  const re = new RegExp(`${START}[\\s\\S]*?${END}`);
  if (re.test(existing)) return existing.replace(re, block);
  const sep = existing.trim() ? `${existing.replace(/\s*$/, "")}\n\n` : "";
  return `${sep}${block}\n`;
}

async function readOr(path: string) {
  try {
    return await readFile(path, "utf8");
  } catch {
    return "";
  }
}

async function write(path: string, text: string) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, text);
}

export function registerAgents(program: Command) {
  program
    .command("guide")
    .description("Print the usage guide for AI agents (Claude Code, Codex, …)")
    .action(
      action(
        async () => {
          // Plain text even when piped: agents read it as instructions.
          process.stdout.write(AGENT_GUIDE);
        },
        { auth: false },
      ),
    );

  program
    .command("setup")
    .description("Teach an agent to use Octonote: writes a section into CLAUDE.md (claude) or AGENTS.md (codex)")
    .argument("<agent>", "claude | codex")
    .option("--dir <path>", "project folder", ".")
    .option("--global", "for every project: ~/.claude/CLAUDE.md or ~/.codex/AGENTS.md")
    .option("--skill", "claude only: also install the Octonote skill (.claude/skills/octonote)")
    .action(
      action(
        async (_ctx, agent: string, opts: { dir: string; global?: boolean; skill?: boolean }) => {
          const which = agent.toLowerCase();
          if (which !== "claude" && which !== "codex") throw usage(`Unknown agent "${agent}".`, "Use claude or codex.");
          if (opts.skill && which !== "claude") throw usage("--skill is for Claude Code only.");
          const base = opts.global ? join(homedir(), which === "claude" ? ".claude" : ".codex") : resolve(opts.dir);
          const file = join(base, which === "claude" ? "CLAUDE.md" : "AGENTS.md");
          await write(file, upsertSection(await readOr(file), PROJECT_SECTION));
          const written = [file];
          if (opts.skill) {
            const skill = join(opts.global ? join(homedir(), ".claude") : join(base, ".claude"), "skills/octonote/SKILL.md");
            await write(skill, CLAUDE_SKILL);
            written.push(skill);
          }
          emit({ agent: which, files: written }, (d) => `Updated:\n${d.files.map((f) => `  ${f}`).join("\n")}\n${which === "claude" ? "Claude Code" : "Codex"} will now use Octonote when you ask.`);
        },
        { auth: false },
      ),
    );
}
