/**
 * The service worker: the only part of the extension that holds the Octonote
 * token or talks to Octonote.
 *
 * - Connecting is a PKCE-style handshake: the connect page only ever sees a
 *   one-time code, which is useless without the verifier kept here.
 * - The token it gets can only work with collections, and disconnecting
 *   revokes it.
 * - Every request is checked against who sent it: the side panel can manage
 *   collections; the clipper on ChatGPT, Claude and Gemini can only add clips
 *   (and undo its own); Octonote's connect page can only hand over a code.
 */
import { appFor, cleanContent, cleanSource } from "./clean";
import { CHAT_ORIGINS, ENVIRONMENTS, environment, type Environment } from "./env";
import type {
  ClipRow,
  CollectionDetail,
  CollectionSummary,
  Connection,
  ItemContent,
  ItemSummary,
  PanelEvent,
  Request,
  Response,
  Status,
  TabCommand,
} from "./messages";
import { challengeFor, newVerifier } from "./pkce";

const CONNECTION = "connection";
const ENDED = "ended";
const PENDING = "pendingConnect";
const RECENT = "recentClips";
const PANEL_TAB = "panelTab";
/** How long a connect started from the panel stays open. */
const PENDING_MS = 10 * 60_000;
/** How long a page's Undo can take back its clip. */
const UNDO_MS = 10 * 60_000;

// Content scripts never need storage: keep the token out of their reach.
for (const area of [chrome.storage.local, chrome.storage.session])
  area.setAccessLevel?.({ accessLevel: "TRUSTED_CONTEXTS" }).catch(() => undefined);

class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

// --- Stored state -------------------------------------------------------------------

async function connection(): Promise<Connection | null> {
  const stored = await chrome.storage.local.get(CONNECTION);
  const c = stored[CONNECTION] as Connection | undefined;
  return c && environment(c.env) ? c : null;
}

async function save(c: Connection) {
  await chrome.storage.local.set({ [CONNECTION]: c });
}

interface Pending {
  env: string;
  read: boolean;
  verifier: string;
  url: string;
  at: number;
}

async function pending(): Promise<Pending | null> {
  const p = (await chrome.storage.session.get(PENDING))[PENDING] as Pending | undefined;
  return p && Date.now() - p.at < PENDING_MS ? p : null;
}

/** Clip ids a page may still undo, so a page can't remove anything else. */
async function rememberClip(id: string) {
  const recent = ((await chrome.storage.session.get(RECENT))[RECENT] ?? {}) as Record<string, number>;
  const now = Date.now();
  for (const [key, at] of Object.entries(recent)) if (now - at > UNDO_MS) delete recent[key];
  recent[id] = now;
  await chrome.storage.session.set({ [RECENT]: recent });
}

async function mayUndo(id: string) {
  const recent = ((await chrome.storage.session.get(RECENT))[RECENT] ?? {}) as Record<string, number>;
  return recent[id] !== undefined && Date.now() - recent[id]! <= UNDO_MS;
}

// --- Talking to Octonote --------------------------------------------------------------

async function call<T>(env: Environment, path: string, init: RequestInit & { token?: string } = {}): Promise<T> {
  const { token, ...rest } = init;
  let response: globalThis.Response;
  try {
    response = await fetch(`${env.api}${path}`, {
      ...rest,
      credentials: "omit",
      headers: {
        "content-type": "application/json",
        "x-octonote-client": "extension",
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
    });
  } catch {
    throw new ApiError("Can't reach Octonote. Check your connection and try again.", 0);
  }
  if (response.status === 204) return undefined as T;
  // The API wraps every reply as { result, statusCode, message, success }.
  const body = (await response.json().catch(() => null)) as { result?: T; message?: string } | null;
  if (!response.ok)
    throw new ApiError(body?.message || `Octonote couldn't do that (${response.status}).`, response.status);
  return (body && "result" in body ? body.result : body) as T;
}

/** A call with the stored token; a rejected token ends the connection. */
async function api<T>(c: Connection, path: string, init: RequestInit = {}): Promise<T> {
  try {
    return await call<T>(environment(c.env)!, path, { ...init, token: c.token });
  } catch (e) {
    if (e instanceof ApiError && e.status === 401) {
      await chrome.storage.local.remove(CONNECTION);
      await chrome.storage.local.set({ [ENDED]: "Your Octonote connection expired or was revoked. Connect again to keep clipping." });
      throw Object.assign(new Error("Connect to Octonote again."), { needsConnect: true });
    }
    throw e;
  }
}

/** Tells the side panel, if it's open; nobody listening is fine. */
function broadcast(event: PanelEvent) {
  chrome.runtime.sendMessage(event).catch(() => undefined);
}

// --- Who's asking ------------------------------------------------------------------------

type Caller = "panel" | "chat" | "connect";

const ALLOWED: Record<Caller, Request["type"][]> = {
  panel: [
    "status", "beginConnect", "cancelConnect", "disconnect", "collections", "useCollection",
    "createCollection", "renameCollection", "collection", "reorder", "restoreClip", "removeClip",
    "insertIntoTab", "items",
  ],
  chat: ["clip", "undoClip", "openPanel", "currentClips", "items", "item", "itemImage"],
  connect: ["exchange"],
};

function originOf(sender: chrome.runtime.MessageSender) {
  if (sender.origin) return sender.origin;
  try {
    return new URL(sender.url ?? "").origin;
  } catch {
    return "";
  }
}

function callerOf(sender: chrome.runtime.MessageSender): Caller | null {
  if (sender.id !== chrome.runtime.id) return null;
  // The extension's own pages (the side panel, or panel.html opened in a tab). Content
  // scripts report the page they run in, never a chrome-extension:// address.
  if (sender.url?.startsWith(chrome.runtime.getURL(""))) return "panel";
  if (!sender.tab) return null;
  const origin = originOf(sender);
  if (CHAT_ORIGINS.includes(origin)) return "chat";
  if (ENVIRONMENTS.some((e) => e.webOrigins.includes(origin))) return "connect";
  return null;
}

// --- Requests -----------------------------------------------------------------------------

const needsConnect = (): Response => ({
  ok: false,
  error: "Connect the extension to Octonote first.",
  needsConnect: true,
});

async function status(): Promise<Status> {
  const c = await connection();
  const p = await pending();
  const env = c ? environment(c.env)! : null;
  return {
    connection:
      c && env
        ? {
            env: c.env,
            envLabel: env.label,
            webUrl: env.web,
            workspaceId: c.workspaceId,
            workspaceName: c.workspaceName,
            collectionId: c.collectionId,
            collectionName: c.collectionName,
            canRead: c.scope === "clipper_read",
          }
        : null,
    pending: p ? { env: p.env, envLabel: environment(p.env)!.label, url: p.url } : null,
    ended: ((await chrome.storage.local.get(ENDED))[ENDED] as string | undefined) ?? null,
    environments: ENVIRONMENTS.map(({ id, label }) => ({ id, label })),
    tab: await takePanelTab(),
  };
}

/** The tab a chat asked the panel to show, once. */
async function takePanelTab(): Promise<Status["tab"]> {
  const tab = (await chrome.storage.session.get(PANEL_TAB))[PANEL_TAB] as Status["tab"] | undefined;
  if (tab) await chrome.storage.session.remove(PANEL_TAB);
  return tab ?? null;
}

/** A PNG from Octonote, as a data: URL the chat page can turn back into a file. */
async function image(c: Connection, path: string): Promise<string> {
  let response: globalThis.Response;
  try {
    response = await fetch(`${environment(c.env)!.api}${path}`, {
      credentials: "omit",
      headers: { authorization: `Bearer ${c.token}`, "x-octonote-client": "extension" },
    });
  } catch {
    throw new ApiError("Can't reach Octonote. Check your connection and try again.", 0);
  }
  if (!response.ok) throw new ApiError("Couldn't get the canvas picture.", response.status);
  const blob = await response.blob();
  if (!blob.type.startsWith("image/") || blob.size > 4 * 1024 * 1024) throw new ApiError("The canvas picture isn't usable.", 0);
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return `data:${blob.type};base64,${btoa(binary)}`;
}

const needsRead = (): Response => ({
  ok: false,
  error: "Turn on “Insert notes into chats” in the Octonote side panel first.",
  needsRead: true,
});

/** Whether a tab is a chat the clipper runs in (it's the only one that answers), and which. */
async function chatApp(tabId: number | undefined): Promise<string | null> {
  if (tabId === undefined) return null;
  try {
    const answer = (await chrome.tabs.sendMessage(tabId, { command: "ping" } satisfies TabCommand)) as { app?: string } | undefined;
    return answer?.app ?? null;
  } catch {
    return null;
  }
}

/**
 * The chat tab to insert into: the active tab if it's a chat, else the chat used most
 * recently in that window. (Tabs' addresses are hidden without the broad "tabs"
 * permission, so each tab is asked instead.)
 */
async function activeChatTab(): Promise<{ tab: chrome.tabs.Tab; app: string } | null> {
  const tabs = await chrome.tabs.query({ lastFocusedWindow: true });
  const ordered = [...tabs].sort((a, b) => Number(b.active) - Number(a.active) || (b.lastAccessed ?? 0) - (a.lastAccessed ?? 0));
  for (const tab of ordered.slice(0, 20)) {
    const app = await chatApp(tab.id);
    if (app) return { tab, app };
  }
  return null;
}

async function addClip(c: Connection, collectionId: string, content: string, source: unknown) {
  const clip = await api<ClipRow>(c, `/collections/${encodeURIComponent(collectionId)}/clips`, {
    method: "POST",
    body: JSON.stringify({ content, source: cleanSource(source) }),
  });
  broadcast({ event: "clipped", collectionId, clip });
  return clip;
}

function openPanel(sender: chrome.runtime.MessageSender) {
  if (sender.tab?.id !== undefined) return chrome.sidePanel.open({ tabId: sender.tab.id }).catch(() => undefined);
}

async function handle(request: Request, sender: chrome.runtime.MessageSender): Promise<Response> {
  const caller = callerOf(sender);
  if (!caller || !ALLOWED[caller].includes(request.type))
    return { ok: false, error: "Not allowed." };

  switch (request.type) {
    case "status":
      return { ok: true, status: await status() };

    case "beginConnect": {
      const env = environment(request.env);
      if (!env) return { ok: false, error: "Unknown Octonote address." };
      const verifier = newVerifier();
      const read = request.read === true;
      const url = `${env.web}/workspace/extension?challenge=${await challengeFor(verifier)}${read ? "&read=1" : ""}`;
      await chrome.storage.session.set({ [PENDING]: { env: env.id, read, verifier, url, at: Date.now() } satisfies Pending });
      await chrome.tabs.create({ url });
      return { ok: true, url };
    }

    case "cancelConnect":
      await chrome.storage.session.remove(PENDING);
      return { ok: true };

    case "exchange": {
      const p = await pending();
      const env = p && environment(p.env);
      // Only the Octonote the person chose in the panel can finish connecting.
      if (!p || !env || !env.webOrigins.includes(originOf(sender)))
        return { ok: false, error: "Start connecting from the Octonote side panel." };
      if (typeof request.code !== "string" || !/^onc_[A-Za-z0-9_-]{20,}$/.test(request.code))
        return { ok: false, error: "That connect code isn't valid." };
      const result = await call<{ token: string; workspaceId: string; workspaceName?: string; scope?: string }>(env, "/extension/token", {
        method: "POST",
        body: JSON.stringify({ code: request.code, verifier: p.verifier }),
      });
      if (!result?.token?.startsWith("ont_")) return { ok: false, error: "Octonote didn't send a token." };
      const previous = await connection();
      await chrome.storage.session.remove(PENDING);
      await chrome.storage.local.remove(ENDED);
      // Reconnecting (e.g. to turn note access on or off) keeps the chosen collection.
      const same = previous?.env === env.id && previous.workspaceId === result.workspaceId;
      await save({
        env: env.id,
        token: result.token,
        workspaceId: result.workspaceId,
        workspaceName: result.workspaceName,
        scope: result.scope === "clipper_read" ? "clipper_read" : "clipper",
        ...(same ? { collectionId: previous.collectionId, collectionName: previous.collectionName } : {}),
      });
      // The old token isn't needed any more.
      if (previous) await api(previous, "/me/cli-tokens/current", { method: "DELETE" }).catch(() => undefined);
      return { ok: true, workspaceName: result.workspaceName };
    }

    case "openPanel":
      if (request.tab) await chrome.storage.session.set({ [PANEL_TAB]: request.tab });
      try {
        if (sender.tab?.id === undefined) throw new Error("No tab");
        await chrome.sidePanel.open({ tabId: sender.tab.id });
        return { ok: true };
      } catch {
        // Chrome only opens the panel straight after a click; say where it is instead.
        return { ok: false, error: "Click the Octonote Clipper button in your toolbar to open the panel." };
      }
  }

  const c = await connection();
  if (request.type === "disconnect") {
    await chrome.storage.local.remove([CONNECTION, ENDED]);
    // Revoke the token too, so it's dead even if a copy exists somewhere.
    if (c) await api(c, "/me/cli-tokens/current", { method: "DELETE" }).catch(() => undefined);
    return { ok: true };
  }
  if (!c) {
    if (caller === "chat") void openPanel(sender);
    return needsConnect();
  }

  switch (request.type) {
    case "collections":
      return {
        ok: true,
        collections: await api<CollectionSummary[]>(c, `/collections?workspaceId=${encodeURIComponent(c.workspaceId)}`),
      };

    case "useCollection": {
      const { collectionId: _id, collectionName: _name, ...rest } = c;
      await save(request.id ? { ...rest, collectionId: request.id, collectionName: request.name } : rest);
      return { ok: true };
    }

    case "createCollection": {
      const name = String(request.name ?? "").trim().slice(0, 120);
      if (!name) return { ok: false, error: "Give the collection a name." };
      const made = await api<{ id: string; name: string }>(c, "/collections", {
        method: "POST",
        body: JSON.stringify({ workspaceId: c.workspaceId, name }),
      });
      await save({ ...c, collectionId: made.id, collectionName: made.name });
      return { ok: true, collectionName: made.name };
    }

    case "renameCollection": {
      const name = String(request.name ?? "").trim().slice(0, 120);
      if (!c.collectionId || !name) return { ok: false, error: "Give the collection a name." };
      const renamed = await api<{ name: string }>(c, `/collections/${encodeURIComponent(c.collectionId)}`, {
        method: "PATCH",
        body: JSON.stringify({ name }),
      });
      await save({ ...c, collectionName: renamed.name });
      return { ok: true, collectionName: renamed.name };
    }

    case "collection":
      if (!c.collectionId) return { ok: false, error: "Pick a collection.", needsCollection: true };
      return {
        ok: true,
        collection: await api<CollectionDetail>(c, `/collections/${encodeURIComponent(c.collectionId)}`),
      };

    case "reorder":
      if (!c.collectionId) return { ok: false, error: "Pick a collection.", needsCollection: true };
      return {
        ok: true,
        collection: await api<CollectionDetail>(c, `/collections/${encodeURIComponent(c.collectionId)}/order`, {
          method: "POST",
          body: JSON.stringify({ ids: request.ids.filter((id) => typeof id === "string").slice(0, 200) }),
        }),
      };

    case "clip": {
      if (!c.collectionId) {
        void openPanel(sender);
        return { ok: false, error: "Pick a collection in the Octonote side panel.", needsCollection: true };
      }
      const checked = cleanContent(request.content);
      if ("error" in checked) return { ok: false, error: checked.error };
      const clip = await addClip(c, c.collectionId, checked.content, request.source);
      await rememberClip(clip.id);
      return { ok: true, clipId: clip.id, collectionName: c.collectionName };
    }

    case "restoreClip": {
      const checked = cleanContent(request.content);
      if ("error" in checked) return { ok: false, error: checked.error };
      const clip = await addClip(c, request.collectionId, checked.content, request.source);
      return { ok: true, clipId: clip.id };
    }

    case "undoClip":
      if (!(await mayUndo(request.id))) return { ok: false, error: "That clip can't be undone from here any more." };
      await api(c, `/collections/clips/${encodeURIComponent(request.id)}`, { method: "DELETE" });
      broadcast({ event: "unclipped", id: request.id });
      return { ok: true };

    case "removeClip":
      await api(c, `/collections/clips/${encodeURIComponent(request.id)}`, { method: "DELETE" });
      broadcast({ event: "unclipped", id: request.id });
      return { ok: true };

    case "currentClips":
      if (!c.collectionId) return { ok: false, error: "Choose a collection in the Octonote side panel.", needsCollection: true };
      return { ok: true, clips: await api<CollectionDetail>(c, `/collections/${encodeURIComponent(c.collectionId)}`) };

    case "items": {
      if (c.scope !== "clipper_read") return needsRead();
      const q = String(request.q ?? "").trim().slice(0, 200);
      return {
        ok: true,
        items: await api<ItemSummary[]>(
          c,
          `/extension/items?workspaceId=${encodeURIComponent(c.workspaceId)}&limit=30${q ? `&q=${encodeURIComponent(q)}` : ""}`,
        ),
      };
    }

    case "item":
      if (c.scope !== "clipper_read") return needsRead();
      return { ok: true, item: await api<ItemContent>(c, `/extension/items/${encodeURIComponent(request.id)}`) };

    case "itemImage":
      if (c.scope !== "clipper_read") return needsRead();
      return { ok: true, image: await image(c, `/extension/items/${encodeURIComponent(request.id)}/image`) };

    case "insertIntoTab": {
      if (request.id && c.scope !== "clipper_read") return needsRead();
      const found = await activeChatTab();
      const tab = found?.tab;
      if (tab?.id === undefined) return { ok: false, error: "Open a chat on ChatGPT, Claude or Gemini in this window first." };
      const command: TabCommand = request.id ? { command: "insertItem", id: request.id } : { command: "insertClips" };
      try {
        await chrome.tabs.sendMessage(tab.id, command);
      } catch {
        return { ok: false, error: "Reload the chat page, then try again." };
      }
      // Bring the chat forward so the person sees it arrive.
      await chrome.tabs.update(tab.id, { active: true });
      return { ok: true, app: found!.app };
    }
  }
  return { ok: false, error: "Not allowed." };
}

chrome.runtime.onMessage.addListener((request: Request | PanelEvent, sender, reply: (r: Response) => void) => {
  // The worker's own broadcasts to the panel aren't requests.
  if (!request || typeof request !== "object" || !("type" in request)) return false;
  handle(request, sender)
    .then(reply)
    .catch((error: Error & { needsConnect?: boolean }) =>
      reply({
        ok: false,
        error: error.message || "Something went wrong.",
        ...(error.needsConnect ? { needsConnect: true } : {}),
      }),
    );
  // Keeps the channel open for the async reply.
  return true;
});

// --- Toolbar, right-click menu and shortcut ---------------------------------------------------

chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => undefined);

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.removeAll(() =>
    chrome.contextMenus.create({
      id: "octonote-clip",
      title: "Clip to Octonote",
      contexts: ["selection"],
    }),
  );
});

async function flash(ok: boolean, tabId?: number) {
  await chrome.action.setBadgeBackgroundColor({ color: ok ? "#191919" : "#D44C47", tabId });
  await chrome.action.setBadgeText({ text: ok ? "✓" : "!", tabId });
  setTimeout(() => void chrome.action.setBadgeText({ text: "", tabId }), 2500);
}

/** On a chat site the clipper clips the selection as Markdown; elsewhere the plain text is used. */
async function clipSelectionIn(tab: chrome.tabs.Tab | undefined, selectionText?: string) {
  if (tab?.id === undefined) return;
  if (await chatApp(tab.id)) {
    await chrome.tabs
      .sendMessage(tab.id, { command: "clipSelection" } satisfies TabCommand)
      .catch(() => flash(false, tab.id));
    return;
  }
  if (!selectionText) return flash(false, tab.id);
  const c = await connection();
  if (!c?.collectionId) return flash(false, tab.id);
  const checked = cleanContent(selectionText);
  if ("error" in checked) return flash(false, tab.id);
  const ok = await addClip(c, c.collectionId, checked.content, {
    app: appFor(tab.url),
    url: tab.url,
    title: tab.title,
  }).then(
    () => true,
    () => false,
  );
  await flash(ok, tab.id);
}

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId !== "octonote-clip") return;
  void clipSelectionIn(tab, info.selectionText);
});

chrome.commands.onCommand.addListener((command, tab) => {
  if (command === "clip-selection") void clipSelectionIn(tab);
});
