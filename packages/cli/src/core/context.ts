/**
 * What every command needs: config, an API client, and the workspace to
 * work in (flag → OCTONOTE_WORKSPACE → `octonote workspace use` → the
 * workspace you own).
 */
import { CliError, usage } from "./errors.js";
import { ApiClient } from "./http.js";
import { resolveConfig, type ResolvedConfig } from "./config.js";

export interface GlobalFlags {
  apiUrl?: string;
  webUrl?: string;
  workspace?: string;
}

export interface Me {
  user: { id: string; name: string; email: string };
  memberships: {
    membership: { role: "OWNER" | "ADMIN" | "MEMBER" };
    workspace: { id: string; name: string; slug: string };
  }[];
}

export interface Ctx {
  config: ResolvedConfig;
  api: ApiClient;
  /** Fetches /me once per run. */
  me(): Promise<Me>;
  workspaceId(): Promise<string>;
}

const VERSION = "0.1.0";

export async function createContext(flags: GlobalFlags, { requireAuth = true } = {}): Promise<Ctx> {
  const config = await resolveConfig(flags);
  if (requireAuth && !config.token) {
    throw new CliError("You're not signed in.", "NOT_LOGGED_IN", {
      hint: "Run `octonote login`, or set OCTONOTE_TOKEN (Settings → CLI & agents → Create token).",
    });
  }
  const api = new ApiClient({ apiUrl: config.apiUrl, token: config.token, userAgent: `octonote-cli/${VERSION}` });
  let me: Promise<Me> | null = null;
  const getMe = () => (me ??= api.get<Me>("/me"));
  return {
    config,
    api,
    me: getMe,
    async workspaceId() {
      const { memberships } = await getMe();
      if (config.workspaceId) {
        if (!memberships.some((m) => m.workspace.id === config.workspaceId)) {
          throw usage(`You're not a member of workspace ${config.workspaceId}.`, "`octonote workspace list` shows yours.");
        }
        return config.workspaceId;
      }
      const pick = memberships.find((m) => m.membership.role === "OWNER") ?? memberships[0];
      if (!pick) throw new CliError("This account has no workspace.", "NO_WORKSPACE", { hint: "Open octonote.ai once to create one." });
      return pick.workspace.id;
    },
  };
}

export interface NotebookSummary {
  id: string;
  name: string;
}

/** A notebook by id (ntb_…) or by exact name, case-insensitive. */
export async function resolveNotebook(ctx: Ctx, ref: string): Promise<NotebookSummary> {
  if (/^ntb_/.test(ref)) {
    const { notebook } = await ctx.api.get<{ notebook: NotebookSummary }>(`/notebooks/${ref}`);
    return notebook;
  }
  const ws = await ctx.workspaceId();
  const all = await ctx.api.get<NotebookSummary[]>(`/workspaces/${ws}/notebooks`);
  const wanted = ref.trim().toLowerCase();
  const matches = all.filter((n) => n.name.trim().toLowerCase() === wanted);
  if (matches.length === 1) return matches[0]!;
  if (matches.length > 1) {
    throw usage(`More than one notebook is called "${ref}".`, `Use its id: ${matches.map((m) => m.id).join(", ")}`);
  }
  throw new CliError(`No notebook called "${ref}".`, "NOT_FOUND", {
    hint: "`octonote notebook list` shows them; `octonote notebook create` makes one.",
  });
}
