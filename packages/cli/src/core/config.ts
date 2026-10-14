/**
 * Where the CLI keeps its sign-in and preferences: ~/.octonote/config.json
 * (file mode 0600; override the folder with OCTONOTE_CONFIG_DIR). Env vars
 * win over the file, so agents and CI never need it:
 *   OCTONOTE_TOKEN      a token from Settings → CLI & agents
 *   OCTONOTE_API_URL    default https://api.octonote.ai
 *   OCTONOTE_WEB_URL    default https://octonote.ai
 *   OCTONOTE_WORKSPACE  workspace id to use
 */
import { chmod, mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

// Our own domain, so the CLI never needs updating when hosting moves.
export const DEFAULT_API_URL = "https://api.octonote.ai";
export const DEFAULT_WEB_URL = "https://octonote.ai";

export interface StoredConfig {
  token?: string;
  email?: string;
  workspaceId?: string;
  apiUrl?: string;
  webUrl?: string;
}

export interface ResolvedConfig {
  token: string | null;
  tokenSource: "env" | "file" | null;
  email: string | null;
  workspaceId: string | null;
  apiUrl: string;
  webUrl: string;
}

export function configDir() {
  return process.env.OCTONOTE_CONFIG_DIR || join(homedir(), ".octonote");
}
const configPath = () => join(configDir(), "config.json");

export async function readStored(): Promise<StoredConfig> {
  try {
    return JSON.parse(await readFile(configPath(), "utf8")) as StoredConfig;
  } catch {
    return {};
  }
}

export async function writeStored(
  patch: Partial<StoredConfig>,
  replace = false,
) {
  const next = replace ? patch : { ...(await readStored()), ...patch };
  for (const k of Object.keys(next) as (keyof StoredConfig)[])
    if (next[k] === undefined) delete next[k];
  await mkdir(configDir(), { recursive: true, mode: 0o700 });
  await writeFile(configPath(), `${JSON.stringify(next, null, 2)}\n`, {
    mode: 0o600,
  });
  // writeFile's mode only applies on create; tighten an existing file too.
  await chmod(configPath(), 0o600).catch(() => undefined);
}

/** API addresses that are gone; configs still holding them use the default instead. */
const RETIRED_API_URLS = new Set([
  "https://api-production-fb09.up.railway.app",
]);

/** Only keep an address in the config when it isn't the default (or a retired one). */
export function customUrl(url: string, fallback: string): string | undefined {
  const clean = url.replace(/\/+$/, "");
  return clean === fallback || RETIRED_API_URLS.has(clean) ? undefined : clean;
}

export async function resolveConfig(
  flags: { apiUrl?: string; webUrl?: string; workspace?: string } = {},
): Promise<ResolvedConfig> {
  const stored = await readStored();
  const envToken = process.env.OCTONOTE_TOKEN?.trim();
  const strip = (u: string) => u.replace(/\/+$/, "");
  return {
    token: envToken || stored.token || null,
    tokenSource: envToken ? "env" : stored.token ? "file" : null,
    email: stored.email ?? null,
    workspaceId:
      flags.workspace ||
      process.env.OCTONOTE_WORKSPACE ||
      stored.workspaceId ||
      null,
    apiUrl: strip(
      flags.apiUrl ||
        process.env.OCTONOTE_API_URL ||
        (stored.apiUrl && !RETIRED_API_URLS.has(strip(stored.apiUrl))
          ? stored.apiUrl
          : undefined) ||
        DEFAULT_API_URL,
    ),
    webUrl: strip(
      flags.webUrl ||
        process.env.OCTONOTE_WEB_URL ||
        stored.webUrl ||
        DEFAULT_WEB_URL,
    ),
  };
}
