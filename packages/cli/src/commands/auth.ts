import type { Command } from "commander";
import { readStored, writeStored } from "../core/config.js";
import { CliError, usage } from "../core/errors.js";
import { ApiClient } from "../core/http.js";
import { readStdin } from "../core/input.js";
import { browserLogin, TOKEN_RE } from "../core/login.js";
import { emit, info, table } from "../core/output.js";
import { action } from "../core/run.js";

export function registerAuth(program: Command) {
  program
    .command("login")
    .description(
      "Sign in through the browser (or --paste a token from Settings → CLI & agents)",
    )
    .option("--paste", "read a token from stdin instead of opening the browser")
    .action(
      action(
        async (ctx, opts: { paste?: boolean }) => {
          let token: string;
          if (opts.paste) {
            token = (await readStdin()).trim();
            if (!TOKEN_RE.test(token))
              throw usage(
                "That isn't an Octonote token (they start with ont_).",
              );
          } else {
            if (!process.stdout.isTTY && !process.stderr.isTTY) {
              throw usage(
                "`octonote login` needs a person at a browser.",
                "Agents and CI: set OCTONOTE_TOKEN (Settings → CLI & agents → Create token), or pipe one into `octonote login --paste`.",
              );
            }
            ({ token } = await browserLogin({
              webUrl: ctx.config.webUrl,
              onUrl: (url) => {
                process.stderr.write(
                  `Opening your browser to connect the CLI…\nIf it doesn't open, visit:\n  ${url}\n`,
                );
                if (process.stdin.isTTY)
                  process.stderr.write(
                    "…or paste a token here and press Enter.\n",
                  );
              },
            }));
          }
          // Check the token works before saving it.
          const me = await new ApiClient({
            apiUrl: ctx.config.apiUrl,
            token,
          }).get<{
            user: { email: string; name: string };
          }>("/me");
          await writeStored({
            token,
            email: me.user.email,
            apiUrl: ctx.config.apiUrl,
            webUrl: ctx.config.webUrl,
          });
          emit(
            { signedIn: true, email: me.user.email },
            () => `✓ Signed in as ${me.user.email}`,
          );
          info(
            "\nNext: teach your agent to use Octonote —\n  octonote setup claude          (or: octonote setup claude --global --skill)\n  octonote setup codex\nRun `octonote` for the full getting-started screen.",
          );
          if (ctx.config.tokenSource === "env")
            info(
              "Note: OCTONOTE_TOKEN is set and takes precedence over this sign-in.",
            );
        },
        { auth: false },
      ),
    );

  program
    .command("logout")
    .description("Sign out here and revoke this computer's token")
    .action(
      action(
        async (ctx) => {
          const stored = await readStored();
          if (stored.token) {
            // Best effort: the token is forgotten locally either way.
            await ctx.api
              .delete("/me/cli-tokens/current")
              .catch(() => undefined);
          }
          await writeStored({
            token: undefined,
            email: undefined,
            workspaceId: undefined,
          });
          emit({ signedOut: true }, () => "Signed out.");
        },
        { auth: false },
      ),
    );

  program
    .command("whoami")
    .description("Who you're signed in as, and which workspace commands use")
    .action(
      action(async (ctx) => {
        const me = await ctx.me();
        const ws = await ctx.workspaceId();
        const workspace = me.memberships.find(
          (m) => m.workspace.id === ws,
        )?.workspace;
        emit(
          {
            email: me.user.email,
            name: me.user.name,
            workspace: workspace
              ? { id: workspace.id, name: workspace.name }
              : null,
            tokenSource: ctx.config.tokenSource,
            apiUrl: ctx.config.apiUrl,
            webUrl: ctx.config.webUrl,
          },
          (d) =>
            `${d.name} <${d.email}>\nworkspace: ${d.workspace?.name ?? "—"} (${d.workspace?.id ?? ""})\nsigned in via: ${d.tokenSource === "env" ? "OCTONOTE_TOKEN" : "octonote login"}`,
        );
      }),
    );

  const account = program
    .command("account")
    .description("Your Octonote account");
  account
    .command("rename")
    .description(
      "Change your display name (shown in the app and as the author of pages you publish)",
    )
    .argument("<name>", "new display name, 1–80 characters")
    .action(
      action(async (ctx, name: string) => {
        const trimmed = name.trim().replace(/\s+/g, " ");
        if (!trimmed || trimmed.length > 80) {
          throw usage("A name needs 1–80 characters.");
        }
        const user = await ctx.api.patch<{ name: string; email: string }>(
          "/me",
          { name: trimmed },
        );
        emit(
          { name: user.name, email: user.email },
          (d) => `Your name is now ${d.name}`,
        );
      }),
    );

  const workspace = program
    .command("workspace")
    .description("Choose which workspace commands work in");
  workspace
    .command("list")
    .description("Workspaces you belong to")
    .action(
      action(async (ctx) => {
        const me = await ctx.me();
        const current = await ctx.workspaceId();
        const rows = me.memberships.map((m) => ({
          id: m.workspace.id,
          name: m.workspace.name,
          role: m.membership.role.toLowerCase(),
          current: m.workspace.id === current,
        }));
        emit(rows, (list) =>
          table(
            list.map((r) => ({ ...r, current: r.current ? "←" : "" })),
            ["id", "name", "role", "current"],
          ),
        );
      }),
    );
  workspace
    .command("use")
    .description("Use this workspace from now on (id or exact name)")
    .argument("<workspace>", "workspace id or name")
    .action(
      action(async (ctx, ref: string) => {
        const me = await ctx.me();
        const match = me.memberships.find(
          (m) =>
            m.workspace.id === ref ||
            m.workspace.name.toLowerCase() === ref.toLowerCase(),
        );
        if (!match)
          throw new CliError(
            `You're not in a workspace called "${ref}".`,
            "NOT_FOUND",
            { hint: "`octonote workspace list` shows yours." },
          );
        await writeStored({ workspaceId: match.workspace.id });
        emit(
          { workspace: { id: match.workspace.id, name: match.workspace.name } },
          (d) => `Now using ${d.workspace.name}`,
        );
      }),
    );

  const token = program
    .command("token")
    .description(
      "Your CLI tokens (create new ones in Settings → CLI & agents)",
    );
  token
    .command("list")
    .description("List your tokens")
    .action(
      action(async (ctx) => {
        const rows = await ctx.api.get<
          {
            id: string;
            name: string;
            preview: string;
            lastUsedAt: string | null;
          }[]
        >("/me/cli-tokens");
        emit(rows, (list) =>
          table(
            list.map((t) => ({
              id: t.id,
              name: t.name,
              token: t.preview,
              "last used": t.lastUsedAt?.slice(0, 10) ?? "never",
            })),
            ["id", "name", "token", "last used"],
          ),
        );
      }),
    );
  token
    .command("revoke")
    .description("Revoke a token")
    .argument("<id>", "token id (tok_…)")
    .action(
      action(async (ctx, id: string) => {
        await ctx.api.delete(`/me/cli-tokens/${id}`);
        emit({ id, revoked: true }, () => `Revoked ${id}`);
      }),
    );
}
