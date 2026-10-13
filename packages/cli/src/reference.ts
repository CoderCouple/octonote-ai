/**
 * The CLI's command reference as data — every command, argument and option,
 * read from the real command definitions — plus the agent guide texts. The
 * octonote.ai/cli docs page renders this, so the docs can't drift from the
 * CLI (scripts/gen-reference.mjs writes it; a test fails if it's stale).
 */
import type { Command } from "commander";
import { AGENT_GUIDE, PROJECT_SECTION } from "./guide/agent-guide.js";

export interface RefOption {
  flags: string;
  description: string;
  default?: string;
  required: boolean;
}
export interface RefArgument {
  name: string;
  description: string;
  required: boolean;
  variadic: boolean;
  default?: string;
}
export interface RefCommand {
  /** Full invocation path, e.g. "note create". */
  name: string;
  aliases: string[];
  description: string;
  arguments: RefArgument[];
  options: RefOption[];
}
export interface Reference {
  version: string;
  globalOptions: RefOption[];
  commands: RefCommand[];
  guide: string;
  projectSection: string;
}

function options(cmd: Command): RefOption[] {
  return cmd.options
    .filter((o) => !["--help", "--version"].includes(o.long ?? ""))
    .map((o) => ({
      flags: o.flags,
      description: o.description,
      required: o.mandatory,
      ...(o.defaultValue !== undefined
        ? { default: String(o.defaultValue) }
        : {}),
    }));
}

export function buildReference(program: Command, version: string): Reference {
  const commands: RefCommand[] = [];
  const walk = (cmd: Command, prefix: string[]) => {
    for (const sub of cmd.commands) {
      const path = [...prefix, sub.name()];
      if (sub.commands.length) {
        walk(sub, path);
        continue;
      }
      commands.push({
        name: path.join(" "),
        aliases: sub.aliases(),
        description: sub.description(),
        arguments: sub.registeredArguments.map((a) => ({
          name: a.name(),
          description: a.description,
          required: a.required,
          variadic: a.variadic,
          ...(a.defaultValue !== undefined
            ? { default: String(a.defaultValue) }
            : {}),
        })),
        options: options(sub),
      });
    }
  };
  walk(program, []);
  return {
    version,
    globalOptions: options(program),
    commands,
    guide: AGENT_GUIDE,
    projectSection: PROJECT_SECTION,
  };
}
