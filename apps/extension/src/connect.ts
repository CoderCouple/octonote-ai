/**
 * On Octonote's "Connect extension" page: tells the page the extension is
 * installed, and passes the one-time connect code the page makes to the
 * worker. The code alone can't be turned into a token; only the worker holds
 * the verifier it's bound to. Only messages from the page itself are taken.
 */
import { ENVIRONMENTS } from "./env";
import { send } from "./messages";

const ours = ENVIRONMENTS.some((e) => e.webOrigins.includes(location.origin));

function reply(message: Record<string, unknown>) {
  window.postMessage({ source: "octonote-extension", ...message }, location.origin);
}

if (ours) {
  reply({ type: "present" });
  window.addEventListener("message", async (event: MessageEvent) => {
    if (event.source !== window || event.origin !== location.origin) return;
    const data = event.data as { source?: unknown; type?: unknown; code?: unknown } | null;
    if (!data || data.source !== "octonote-web") return;
    if (data.type === "ping") return reply({ type: "present" });
    if (data.type !== "connect" || typeof data.code !== "string") return;
    try {
      const result = await send({ type: "exchange", code: data.code });
      reply(
        result.ok
          ? { type: "connected", workspaceName: result.workspaceName }
          : { type: "failed", error: result.error },
      );
    } catch {
      reply({ type: "failed", error: "The extension was updated. Reload this page and try again." });
    }
  });
}
