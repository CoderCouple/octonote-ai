/**
 * The side panel: connect to Octonote, find, switch, make or rename the
 * collection clips go to, and watch its clips arrive as you clip on ChatGPT,
 * Claude or Gemini. Clips can be reordered (drag, or arrow keys on the
 * handle), copied, removed with Undo, and turned into a note in Octonote.
 */
import { icon, type IconName } from "./icons";
import {
  send,
  type ClipRow,
  type CollectionSummary,
  type ConnectionInfo,
  type ItemSummary,
  type PanelEvent,
  type Response,
  type Status,
} from "./messages";
import { renderMarkdown } from "./render";

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const APPS: Record<string, string> = {
  chatgpt: "ChatGPT",
  claude: "Claude",
  gemini: "Gemini",
  octonote: "Octonote",
  web: "Web",
  other: "Clip",
};
/** How often the open panel picks up changes made elsewhere (the web app, another window). */
const POLL_MS = 20_000;

let status: Status | null = null;
let conn: ConnectionInfo | null = null;
let collections: CollectionSummary[] = [];
let clips: ClipRow[] = [];
let loadedClips = false;
const fresh = new Set<string>();
const opened = new Set<string>();
let tab: "clips" | "notes" = "clips";

// --- Theme and icons ----------------------------------------------------------------------

// The design tokens switch to dark under `.dark`, like the app.
const dark = matchMedia("(prefers-color-scheme: dark)");
const applyTheme = () => {
  // Switch instantly; the cards' fade is only for newly arrived clips.
  const root = document.documentElement;
  root.classList.add("switching");
  root.classList.toggle("dark", dark.matches);
  requestAnimationFrame(() => requestAnimationFrame(() => root.classList.remove("switching")));
};
applyTheme();
dark.addEventListener("change", applyTheme);

for (const el of document.querySelectorAll<HTMLElement>("[data-icon]"))
  el.innerHTML = icon(el.dataset.icon as IconName);

function iconButton(name: IconName, label: string, onClick: () => void) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "btn btn-ghost btn-icon btn-xs";
  button.innerHTML = icon(name);
  button.setAttribute("aria-label", label);
  button.title = label;
  button.addEventListener("click", onClick);
  return button;
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

// --- Messages to the person -----------------------------------------------------------------

let toastTimer = 0;
function toast(text: string, options: { error?: boolean; action?: { label: string; run: () => void } } = {}) {
  const box = $("toast");
  box.replaceChildren();
  box.classList.toggle("error", !!options.error);
  const mark = el("span", "toast-icon");
  mark.innerHTML = icon(options.error ? "alert" : "check");
  box.append(mark, el("span", "toast-text", text));
  if (options.action) {
    const { label, run } = options.action;
    const button = el("button", "btn btn-ghost btn-sm", label);
    button.type = "button";
    button.addEventListener("click", () => {
      box.hidden = true;
      run();
    });
    box.append(button);
  }
  const close = iconButton("x", "Dismiss", () => (box.hidden = true));
  box.append(close);
  box.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => (box.hidden = true), options.action ? 8000 : 4000);
}

const fail = (message: string) => toast(message, { error: true });

function banner(message: string | null) {
  $("banner").hidden = !message;
  $("banner-text").textContent = message ?? "";
}

/** Runs a request; on failure says why and returns null. */
async function ask(request: Parameters<typeof send>[0]): Promise<Extract<Response, { ok: true }> | null> {
  let result: Response;
  try {
    result = await send(request);
  } catch {
    fail("The extension was updated. Close and reopen this panel.");
    return null;
  }
  if (result.ok) return result;
  if (result.needsConnect) void refresh();
  else fail(result.error);
  return null;
}

// --- Loading ----------------------------------------------------------------------------------

function show(view: "connect" | "pending" | "main") {
  $("view-connect").hidden = view !== "connect";
  $("view-pending").hidden = view !== "pending";
  $("view-main").hidden = view !== "main";
}

async function load() {
  const result = await send({ type: "status" });
  if (!result.ok || !result.status) return fail(result.ok ? "Couldn't load." : result.error);
  status = result.status;
  conn = status.connection;
  if (!conn) {
    collections = [];
    clips = [];
    loadedClips = false;
    if (status.pending) return show("pending");
    renderConnect();
    return show("connect");
  }
  show("main");
  if (status.tab) tab = status.tab;
  // Note access may have changed (or the list elsewhere): fetch it again when shown.
  notesLoaded = false;
  renderHeader();
  renderTabs();

  let list: Response;
  try {
    list = await send({ type: "collections" });
  } catch {
    return banner("The extension was updated. Close and reopen this panel.");
  }
  if (!list.ok) {
    if (list.needsConnect) return void refresh();
    return banner(list.error);
  }
  banner(null);
  collections = list.collections ?? [];
  // Keep the chosen collection if it still exists; otherwise the most recent one.
  const chosen = collections.find((c) => c.id === conn!.collectionId) ?? collections[0];
  if (chosen?.id !== conn.collectionId) {
    await send({ type: "useCollection", id: chosen?.id ?? null, name: chosen?.name });
    conn = { ...conn, collectionId: chosen?.id, collectionName: chosen?.name };
  }
  await loadClips();
}

async function loadClips() {
  if (!conn?.collectionId) {
    clips = [];
    loadedClips = true;
    return render();
  }
  const result = await send({ type: "collection" });
  if (!result.ok) {
    if (result.needsConnect) return void refresh();
    return banner(result.error);
  }
  banner(null);
  clips = result.collection?.clips ?? [];
  loadedClips = true;
  render();
}

// One load at a time; changes during a load just load again after it.
let queue = Promise.resolve();
const refresh = () =>
  (queue = queue.then(load).catch((e: Error) => banner(e.message || "Couldn't reach Octonote.")));

$("banner-retry").addEventListener("click", () => void refresh());

// --- Connecting ---------------------------------------------------------------------------------

function renderConnect() {
  if (!status) return;
  const envs = status.environments;
  const select = $<HTMLSelectElement>("env");
  if (select.options.length !== envs.length)
    select.replaceChildren(...envs.map((e) => new Option(e.label, e.id)));
  // Only a development build offers more than one Octonote.
  $("env-field").hidden = envs.length < 2;
  $("ended").hidden = !status.ended;
  $("ended-text").textContent = status.ended ?? "";
}

$("connect").addEventListener("click", async () => {
  const button = $<HTMLButtonElement>("connect");
  button.disabled = true;
  const env = $<HTMLSelectElement>("env").value || status?.environments[0]?.id || "octonote";
  await ask({ type: "beginConnect", env, read: false });
  button.disabled = false;
  void refresh();
});
$("pending-open").addEventListener("click", () => {
  if (status?.pending) void chrome.tabs.create({ url: status.pending.url });
});
$("pending-cancel").addEventListener("click", async () => {
  await ask({ type: "cancelConnect" });
  void refresh();
});

// --- Rendering -------------------------------------------------------------------------------------

function current() {
  return collections.find((c) => c.id === conn?.collectionId);
}

function collectionUrl() {
  if (!conn) return "#";
  const c = current();
  return c ? `${conn.webUrl}/workspace/collections/${encodeURIComponent(c.id)}` : `${conn.webUrl}/workspace/collections`;
}

function renderHeader() {
  if (!conn) return;
  $("m-workspace").textContent = conn.workspaceName ?? "Your workspace";
  $("m-env").textContent = conn.envLabel;
  $("m-read-label").textContent = conn.canRead ? "Turn off note access" : "Turn on note access";
}

function render() {
  if (!conn) return;
  const c = current();
  if (c) c.clips = clips.length;
  $("current-name").textContent = c?.name ?? "Choose a collection";
  $("switcher").title = c ? `Clipping to ${c.name}` : "Choose a collection";
  $<HTMLAnchorElement>("m-open").href = collectionUrl();
  $("m-rename").hidden = !c;

  const n = clips.length;
  const write = $<HTMLAnchorElement>("write");
  write.href = collectionUrl();
  write.setAttribute("aria-disabled", String(!n));
  $("insert-clips").setAttribute("aria-disabled", String(!n));

  $("skeleton").hidden = loadedClips;
  $("list-head").hidden = !c || !n;
  $("count").textContent = `${n} ${n === 1 ? "clip" : "clips"}`;
  $("reorder-hint").hidden = n < 2;
  $("empty").hidden = !loadedClips || !c || n > 0;
  $("no-collection").hidden = !loadedClips || !!c;
  renderClips();
}

const ago = new Intl.RelativeTimeFormat(undefined, { numeric: "auto", style: "narrow" });
function since(iso: string) {
  const seconds = (Date.parse(iso) - Date.now()) / 1000;
  if (!Number.isFinite(seconds)) return "";
  const steps: [Intl.RelativeTimeFormatUnit, number][] = [
    ["second", 60], ["minute", 60], ["hour", 24], ["day", 7], ["week", 4.35], ["month", 12], ["year", Infinity],
  ];
  let value = seconds;
  for (const [unit, size] of steps) {
    if (Math.abs(value) < size) return unit === "second" ? "just now" : ago.format(Math.round(value), unit);
    value /= size;
  }
  return "";
}

function hostOf(url?: string) {
  try {
    return url ? new URL(url).hostname.replace(/^www\./, "") : "";
  } catch {
    return "";
  }
}

function renderClips() {
  $("clips").replaceChildren(...clips.map(clipItem));
}

function clipItem(clip: ClipRow, index: number) {
  const li = el("li", "clip");
  li.dataset.id = clip.id;
  if (fresh.has(clip.id)) li.classList.add("fresh");
  if (opened.has(clip.id)) li.classList.add("open");

  const head = el("div", "clip-head");
  const grip = el("button", "grip");
  grip.type = "button";
  grip.draggable = true;
  grip.innerHTML = icon("grip");
  grip.setAttribute("aria-label", `Move clip ${index + 1}. Use the up and down arrow keys.`);
  grip.title = "Drag to reorder";
  wireReorder(grip, li, clip);

  const app = clip.source?.app ?? "other";
  head.append(grip, el("span", "clip-n", String(index + 1)), el("span", "badge", APPS[app] ?? "Clip"));
  const label = clip.source?.title || hostOf(clip.source?.url);
  if (clip.source?.url) {
    const from = el("a", "clip-from", label || "Open source");
    from.href = clip.source.url;
    from.target = "_blank";
    from.rel = "noreferrer";
    from.title = "Open the chat this came from";
    head.append(from);
  } else head.append(el("span", "clip-from", label));
  const time = el("span", "clip-time", since(clip.createdAt));
  time.title = new Date(clip.createdAt).toLocaleString();
  const actions = el("div", "clip-actions");
  actions.append(
    iconButton("copy", "Copy clip", () => void copy(clip)),
    iconButton("trash", "Remove clip", () => void removeClip(clip)),
  );
  head.append(time, actions);

  const body = el("div", "prose");
  // renderMarkdown escapes everything first; only formatting and http(s) links survive.
  body.innerHTML = renderMarkdown(clip.content);
  li.append(head, body);

  const long = clip.content.length > 400 || clip.content.split("\n").length > 7;
  if (!long) li.classList.add("short");
  else {
    const more = el("button", "more", opened.has(clip.id) ? "Show less" : "Show more");
    more.type = "button";
    more.setAttribute("aria-expanded", String(opened.has(clip.id)));
    more.addEventListener("click", () => {
      const open = !opened.has(clip.id);
      if (open) opened.add(clip.id);
      else opened.delete(clip.id);
      li.classList.toggle("open", open);
      more.textContent = open ? "Show less" : "Show more";
      more.setAttribute("aria-expanded", String(open));
    });
    li.append(more);
  }
  return li;
}

// --- Reordering ------------------------------------------------------------------------------------

let dragged: string | null = null;

function wireReorder(grip: HTMLButtonElement, li: HTMLLIElement, clip: ClipRow) {
  grip.addEventListener("dragstart", (e) => {
    dragged = clip.id;
    e.dataTransfer?.setData("text/plain", clip.id);
    e.dataTransfer?.setDragImage(li, 20, 20);
    if (e.dataTransfer) e.dataTransfer.effectAllowed = "move";
    requestAnimationFrame(() => li.classList.add("dragging"));
  });
  grip.addEventListener("dragend", () => {
    dragged = null;
    clearDropMarks();
    li.classList.remove("dragging");
  });
  li.addEventListener("dragover", (e) => {
    if (!dragged || dragged === clip.id) return;
    e.preventDefault();
    const before = e.clientY < li.getBoundingClientRect().top + li.offsetHeight / 2;
    clearDropMarks();
    li.classList.add(before ? "drop-before" : "drop-after");
  });
  li.addEventListener("drop", (e) => {
    e.preventDefault();
    if (!dragged || dragged === clip.id) return;
    const before = li.classList.contains("drop-before");
    clearDropMarks();
    const ids = clips.map((c) => c.id).filter((id) => id !== dragged);
    ids.splice(ids.indexOf(clip.id) + (before ? 0 : 1), 0, dragged);
    void reorder(ids, dragged);
  });
  grip.addEventListener("keydown", (e) => {
    if (e.key !== "ArrowUp" && e.key !== "ArrowDown") return;
    e.preventDefault();
    const from = clips.findIndex((c) => c.id === clip.id);
    const to = from + (e.key === "ArrowUp" ? -1 : 1);
    if (to < 0 || to >= clips.length) return;
    const ids = clips.map((c) => c.id);
    ids.splice(from, 1);
    ids.splice(to, 0, clip.id);
    void reorder(ids, clip.id);
  });
}

function clearDropMarks() {
  for (const node of $("clips").querySelectorAll(".drop-before, .drop-after"))
    node.classList.remove("drop-before", "drop-after");
}

async function reorder(ids: string[], focusId: string) {
  const before = clips;
  // Show the new order straight away; put it back if Octonote says no.
  clips = ids.map((id) => clips.find((c) => c.id === id)!).filter(Boolean);
  render();
  focusGrip(focusId);
  const result = await ask({ type: "reorder", ids });
  if (!result) {
    clips = before;
    render();
  }
}

function focusGrip(id: string) {
  $("clips").querySelector<HTMLButtonElement>(`[data-id="${CSS.escape(id)}"] .grip`)?.focus();
}

// --- Clip actions ----------------------------------------------------------------------------------

async function copy(clip: ClipRow) {
  try {
    await navigator.clipboard.writeText(clip.content);
    toast("Copied as Markdown.");
  } catch {
    fail("Couldn't copy. Select the text and copy it instead.");
  }
}

async function removeClip(clip: ClipRow) {
  const collectionId = conn?.collectionId;
  if (!collectionId) return;
  const index = clips.findIndex((c) => c.id === clip.id);
  clips = clips.filter((c) => c.id !== clip.id);
  render();
  if (!(await ask({ type: "removeClip", id: clip.id }))) return void refresh();
  toast("Clip removed.", { action: { label: "Undo", run: () => void restore(clip, index, collectionId) } });
}

/** Puts a removed clip back where it was. */
async function restore(clip: ClipRow, index: number, collectionId: string) {
  const added = await ask({
    type: "restoreClip",
    content: clip.content,
    source: clip.source ?? { app: "other" },
    collectionId,
  });
  if (!added?.clipId || conn?.collectionId !== collectionId) return;
  const ids = clips.map((c) => c.id).filter((id) => id !== added.clipId);
  ids.splice(index, 0, added.clipId);
  const result = await ask({ type: "reorder", ids });
  if (result?.collection) {
    clips = result.collection.clips;
    render();
  }
}

function arrived(clip: ClipRow) {
  if (clips.some((c) => c.id === clip.id)) return;
  clips.push(clip);
  fresh.add(clip.id);
  render();
  $("clips")
    .querySelector(`[data-id="${CSS.escape(clip.id)}"]`)
    ?.scrollIntoView({ block: "nearest", behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
  setTimeout(() => {
    fresh.delete(clip.id);
    $("clips").querySelector(`[data-id="${CSS.escape(clip.id)}"]`)?.classList.remove("fresh");
  }, 1600);
}

// --- Collection switcher (a combobox: type to find, Enter to pick or create) --------------------------

type Option = { kind: "collection"; collection: CollectionSummary } | { kind: "create"; name: string };
let options: Option[] = [];
let active = 0;

function buildOptions() {
  const query = $<HTMLInputElement>("find").value.trim();
  const q = query.toLowerCase();
  const matches = collections.filter((c) => c.name.toLowerCase().includes(q));
  options = matches.map((collection) => ({ kind: "collection", collection }));
  if (query && !collections.some((c) => c.name.toLowerCase() === q)) options.push({ kind: "create", name: query });
  active = Math.max(0, Math.min(active, options.length - 1));
  renderOptions(query);
}

function renderOptions(query: string) {
  const ul = $("options");
  ul.replaceChildren(
    ...options.map((option, i) => {
      const li = el("li", "option");
      li.id = `option-${i}`;
      li.setAttribute("role", "option");
      li.setAttribute("aria-selected", String(i === active));
      if (option.kind === "collection") {
        const isCurrent = option.collection.id === conn?.collectionId;
        li.classList.toggle("current", isCurrent);
        const check = el("span", "check");
        if (isCurrent) check.innerHTML = icon("check");
        li.append(check, el("span", "name", option.collection.name), el("span", "badge count", String(option.collection.clips)));
      } else {
        li.classList.add("create");
        const plus = el("span", "check");
        plus.innerHTML = icon("plus");
        li.append(plus, el("span", "name", `Create “${option.name}”`));
      }
      li.addEventListener("mousemove", () => {
        if (active !== i) {
          active = i;
          highlight();
        }
      });
      li.addEventListener("mousedown", (e) => e.preventDefault());
      li.addEventListener("click", () => void pick(option));
      return li;
    }),
  );
  if (!options.length) {
    const note = el("li", "note", query ? "" : "No collections yet. Type a name to make one.");
    ul.append(note);
  }
  highlight();
}

function highlight() {
  const find = $<HTMLInputElement>("find");
  $("options")
    .querySelectorAll<HTMLElement>(".option")
    .forEach((node, i) => node.setAttribute("aria-selected", String(i === active)));
  if (options.length) {
    find.setAttribute("aria-activedescendant", `option-${active}`);
    $(`option-${active}`)?.scrollIntoView({ block: "nearest" });
  } else find.removeAttribute("aria-activedescendant");
}

function openSwitcher(open: boolean) {
  $("collection-popover").hidden = !open;
  $("switcher").setAttribute("aria-expanded", String(open));
  if (open) {
    openMenu(false);
    $("rename").hidden = true;
    const find = $<HTMLInputElement>("find");
    find.value = "";
    active = Math.max(0, collections.findIndex((c) => c.id === conn?.collectionId));
    buildOptions();
    find.focus();
  }
}

async function pick(option: Option) {
  openSwitcher(false);
  $("switcher").focus();
  if (option.kind === "collection") {
    if (option.collection.id === conn?.collectionId) return;
    loadedClips = false;
    clips = [];
    render();
    await ask({ type: "useCollection", id: option.collection.id, name: option.collection.name });
    // The storage change reloads the panel with this collection's clips.
  } else {
    const made = await ask({ type: "createCollection", name: option.name });
    if (made) toast(`Clips now go to “${made.collectionName ?? option.name}”.`);
  }
}

$("switcher").addEventListener("click", () => openSwitcher($("collection-popover").hidden));
$("first-collection").addEventListener("click", () => openSwitcher(true));
$("find").addEventListener("input", () => {
  active = 0;
  buildOptions();
});
$("find").addEventListener("keydown", (e) => {
  if (e.key === "ArrowDown" || e.key === "ArrowUp") {
    e.preventDefault();
    if (!options.length) return;
    active = (active + (e.key === "ArrowDown" ? 1 : -1) + options.length) % options.length;
    highlight();
  } else if (e.key === "Enter") {
    e.preventDefault();
    const option = options[active];
    if (option) void pick(option);
  } else if (e.key === "Escape") {
    e.preventDefault();
    openSwitcher(false);
    $("switcher").focus();
  }
});

// --- More menu, rename, disconnect ---------------------------------------------------------------

function openMenu(open: boolean) {
  $("more-menu").hidden = !open;
  $("more").setAttribute("aria-expanded", String(open));
  if (open) {
    openSwitcher(false);
    $("more-menu").querySelector<HTMLElement>(".menu-item:not([hidden])")?.focus();
  }
}

$("more").addEventListener("click", () => openMenu($("more-menu").hidden));
$("more-menu").addEventListener("keydown", (e) => {
  const items = [...$("more-menu").querySelectorAll<HTMLElement>(".menu-item:not([hidden])")];
  const i = items.indexOf(document.activeElement as HTMLElement);
  if (e.key === "ArrowDown" || e.key === "ArrowUp") {
    e.preventDefault();
    items[(i + (e.key === "ArrowDown" ? 1 : -1) + items.length) % items.length]?.focus();
  } else if (e.key === "Escape") {
    openMenu(false);
    $("more").focus();
  }
});
$("m-open").addEventListener("click", () => openMenu(false));
$("m-rename").addEventListener("click", () => {
  openMenu(false);
  $("rename").hidden = false;
  const input = $<HTMLInputElement>("rename-name");
  input.value = current()?.name ?? "";
  input.select();
});
$("rename-cancel").addEventListener("click", () => ($("rename").hidden = true));
$("rename").addEventListener("keydown", (e) => {
  if (e.key === "Escape") $("rename").hidden = true;
});
$<HTMLFormElement>("rename").addEventListener("submit", async (e) => {
  e.preventDefault();
  const name = $<HTMLInputElement>("rename-name").value.trim();
  if (!name) return;
  if (await ask({ type: "renameCollection", name })) $("rename").hidden = true;
});
$("m-disconnect").addEventListener("click", async () => {
  openMenu(false);
  await ask({ type: "disconnect" });
});

document.addEventListener("click", (e) => {
  const target = e.target as Node;
  if (!$("collection-popover").hidden && !$("collection-popover").contains(target) && !$("switcher").contains(target))
    openSwitcher(false);
  if (!$("more-menu").hidden && !$("more-menu").contains(target) && !$("more").contains(target)) openMenu(false);
});

// --- Tabs -------------------------------------------------------------------------------------

function renderTabs() {
  for (const name of ["clips", "notes"] as const) {
    $(`tab-${name}`).setAttribute("aria-selected", String(tab === name));
    $(`tab-${name}`).tabIndex = tab === name ? 0 : -1;
    $(`pane-${name}`).hidden = tab !== name;
  }
  if (tab === "notes") renderNotesPane();
}

function selectTab(name: "clips" | "notes") {
  tab = name;
  renderTabs();
  $(`tab-${name}`).focus();
}
$("tab-clips").addEventListener("click", () => selectTab("clips"));
$("tab-notes").addEventListener("click", () => selectTab("notes"));
for (const id of ["tab-clips", "tab-notes"])
  $(id).addEventListener("keydown", (e) => {
    if (e.key === "ArrowRight" || e.key === "ArrowLeft") selectTab(tab === "clips" ? "notes" : "clips");
  });

// --- Inserting into the chat in this tab -----------------------------------------------------------

async function insertIntoTab(request: { id?: string; clips?: boolean }) {
  const done = await ask({ type: "insertIntoTab", ...request });
  if (done) toast(`Sent to ${done.app === "chatgpt" ? "ChatGPT" : done.app === "claude" ? "Claude" : done.app === "gemini" ? "Gemini" : "the chat"}.`);
}

$("insert-clips").addEventListener("click", () => void insertIntoTab({ clips: true }));

/** Note access needs its own permission: connecting again, asking for it (or not). */
async function setNoteAccess(on: boolean) {
  if (!conn) return;
  if (await ask({ type: "beginConnect", env: conn.env, read: on }))
    toast(on ? "Confirm in the Octonote tab that just opened." : "Confirm in the Octonote tab to turn note access off.");
}
$("read-on").addEventListener("click", () => void setNoteAccess(true));
$("m-read").addEventListener("click", () => {
  openMenu(false);
  void setNoteAccess(!conn?.canRead);
});

// --- Notes pane -----------------------------------------------------------------------------

const KINDS: Record<ItemSummary["kind"], { icon: IconName; label: string }> = {
  note: { icon: "fileText", label: "Note" },
  canvas: { icon: "shapes", label: "Canvas" },
  project: { icon: "folderKanban", label: "Project" },
};
let notesTimer = 0;
let notesSeq = 0;
let notesLoaded = false;

function renderNotesPane() {
  const canRead = !!conn?.canRead;
  $("notes-off").hidden = canRead;
  $("notes-on").hidden = !canRead;
  if (canRead && !notesLoaded) void loadNotes();
}

async function loadNotes() {
  const seq = ++notesSeq;
  const q = $<HTMLInputElement>("notes-find").value.trim();
  $("notes-skeleton").hidden = notesLoaded;
  const result = await send({ type: "items", q }).catch(() => null);
  if (seq !== notesSeq) return;
  notesLoaded = true;
  $("notes-skeleton").hidden = true;
  if (!result?.ok) {
    if (result && !result.ok && result.needsRead && conn) {
      conn = { ...conn, canRead: false };
      return renderNotesPane();
    }
    $("notes").replaceChildren();
    $("notes-empty").hidden = false;
    $("notes-empty-text").textContent = result && !result.ok ? result.error : "Couldn't reach Octonote.";
    return;
  }
  const items = result.items ?? [];
  $("notes").replaceChildren(...items.map(noteItem));
  $("notes-empty").hidden = items.length > 0;
  $("notes-empty-text").textContent = q ? `Nothing in Octonote matches “${q}”.` : "Nothing in this workspace yet.";
}

function noteItem(item: ItemSummary) {
  const li = el("li", "note");
  const kind = el("span", "note-kind");
  kind.innerHTML = icon(KINDS[item.kind].icon);
  const text = el("span", "note-text");
  const meta = [KINDS[item.kind].label, item.notebook, since(item.updatedAt)].filter(Boolean).join(" · ");
  text.append(el("span", "note-title", item.title || "Untitled"), el("span", "note-meta", meta));
  const insert = el("button", "btn btn-outline btn-sm", "Insert");
  insert.type = "button";
  insert.setAttribute("aria-label", `Insert “${item.title || "Untitled"}” into the chat`);
  insert.addEventListener("click", () => void insertIntoTab({ id: item.id }));
  li.append(kind, text, insert);
  return li;
}

$("notes-find").addEventListener("input", () => {
  clearTimeout(notesTimer);
  notesTimer = window.setTimeout(() => void loadNotes(), 200);
});

// --- Live updates -------------------------------------------------------------------------------------

// Clips made on any tab show up here straight away.
chrome.runtime.onMessage.addListener((message: PanelEvent) => {
  if (!message || typeof message !== "object" || !("event" in message)) return false;
  if (message.event === "clipped") {
    if (message.collectionId === conn?.collectionId) arrived(message.clip);
    else {
      const other = collections.find((c) => c.id === message.collectionId);
      if (other) other.clips += 1;
    }
  } else if (message.event === "unclipped" && clips.some((c) => c.id === message.id)) {
    clips = clips.filter((c) => c.id !== message.id);
    render();
  }
  return false;
});

// Connecting, switching, making or renaming a collection all land in storage.
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && ("connection" in changes || "ended" in changes)) void refresh();
  if (area === "session" && "pendingConnect" in changes) void refresh();
});

document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") void refresh();
});
setInterval(() => {
  if (document.visibilityState === "visible" && conn?.collectionId) void loadClips().catch(() => undefined);
  // Keep "2 min ago" current.
  for (const node of $("clips").querySelectorAll<HTMLElement>(".clip")) {
    const clip = clips.find((c) => c.id === node.dataset.id);
    const time = node.querySelector(".clip-time");
    if (clip && time) time.textContent = since(clip.createdAt);
  }
}, POLL_MS);

// Show the shortcut the person actually has.
chrome.commands
  ?.getAll()
  .then((commands) => {
    const shortcut = commands.find((c) => c.name === "clip-selection")?.shortcut;
    if (shortcut) $("shortcut").textContent = shortcut;
  })
  .catch(() => undefined);

void refresh();
