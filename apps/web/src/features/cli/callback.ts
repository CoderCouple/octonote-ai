/**
 * The `octonote login` hand-off: the CLI listens on a loopback port and
 * opens /cli/connect?cb=http://127.0.0.1:<port>/cb&state=<nonce>&name=<device>.
 * Only loopback callbacks are ever accepted, so a crafted link can't send a
 * token anywhere but the user's own machine.
 */
const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost"]);
const STATE_RE = /^[A-Za-z0-9_-]{16,128}$/;

export type CallbackCheck =
  | { ok: true; cb: string; state: string; device: string }
  | { ok: false; reason: string };

export function checkCliCallback(
  cb: string | undefined | null,
  state: string | undefined | null,
  name?: string | null,
): CallbackCheck {
  if (!cb || !state)
    return {
      ok: false,
      reason: "This sign-in link is incomplete. Run `octonote login` again.",
    };
  if (!STATE_RE.test(state))
    return {
      ok: false,
      reason: "This sign-in link is malformed. Run `octonote login` again.",
    };
  let url: URL;
  try {
    url = new URL(cb);
  } catch {
    return {
      ok: false,
      reason: "This sign-in link is malformed. Run `octonote login` again.",
    };
  }
  const port = Number(url.port);
  if (
    url.protocol !== "http:" ||
    !LOOPBACK_HOSTS.has(url.hostname) ||
    url.pathname !== "/cb" ||
    url.search ||
    url.username ||
    url.password ||
    !Number.isInteger(port) ||
    port < 1024 ||
    port > 65535
  ) {
    return {
      ok: false,
      reason:
        "This link doesn't point at the Octonote CLI on your computer, so no token was created.",
    };
  }
  // Shown to the user and used as the token's name in Settings.
  const device =
    (name ?? "")
      .replace(/[^\w .@()-]/g, "")
      .trim()
      .slice(0, 40) || "this computer";
  return { ok: true, cb: url.toString(), state, device };
}
