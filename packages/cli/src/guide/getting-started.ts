/**
 * What `octonote` prints with no command — right after install, too, since
 * the install line is `npm i -g … && octonote`. (npm hides messages printed
 * during install, so this is where setup help lives.) Everything needed to
 * get going, without opening the docs.
 */
export const DOCS_URL = "https://octonote.ai/cli";

export function gettingStarted(opts: {
  version: string;
  signedInAs: string | null;
}): string {
  const signIn = opts.signedInAs
    ? `  ✓ Signed in as ${opts.signedInAs}`
    : `  1. Sign in            octonote login
                        (no browser? set OCTONOTE_TOKEN from Settings → CLI & agents)`;
  return `
  octonote ${opts.version} — Octonote from your terminal, Claude Code and Codex

GET STARTED
${signIn}
  ${opts.signedInAs ? "1." : "2."} Teach your agent   octonote setup claude      # this project's CLAUDE.md
                        octonote setup claude --global --skill   # every project + skill
                        octonote setup codex       # this project's AGENTS.md
                        octonote setup codex --global
     Then just ask: “write this up in Octonote”, “draw this as an Octonote canvas”.

  Claude Code: allow it without prompts — add to ~/.claude/settings.json:
    { "permissions": { "allow": ["Bash(octonote:*)"] } }
  Codex: its sandbox blocks the network by default — in ~/.codex/config.toml:
    [sandbox_workspace_write]
    network_access = true

COMMON COMMANDS
  octonote note create "Title" --file doc.md      note from markdown
  octonote note pull <id> -o doc.md               edit locally, then: note push doc.md
  octonote canvas create "Flow" --from-mermaid flow.mmd   draw a diagram
  octonote project create "Name" --note doc.md --canvas-mermaid flow.mmd
  octonote list · search <words> · notebook list
  octonote publish <id> · share <id> --email … --role viewer|editor

HELP
  octonote --help              all commands
  octonote <command> --help    one command, e.g. octonote note create --help
  octonote guide               the full guide written for AI agents
  ${DOCS_URL}     docs on the web
`;
}
