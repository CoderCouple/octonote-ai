/**
 * "Add from Octonote": the picker that opens over a chat's message box when
 * you type #octonote (or click the Octonote button by the box). Keep typing
 * to search ("#octonote battery"); ↑ ↓ move, Enter inserts, Esc closes. Focus
 * stays in the message box the whole time, like a mention menu, so the chat
 * site never fights over where your typing goes. Notes, canvases, projects or
 * your collected clips go into the message, marked as coming from Octonote.
 * Nothing is read from Octonote until you pick something.
 */
import { insertInto, spotRect, type Editor, type Spot } from "./composer";
import { icon, type IconName } from "./icons";
import { formatClips, formatItem, clipsLength, INSERT_LIMIT, type ItemContent } from "./insert-format";
import { send, type CollectionDetail, type ItemSummary, type Response } from "./messages";

export const PICKER_STYLE = `
  .picker { position: fixed; z-index: 3; display: none; flex-direction: column; width: 420px; max-width: calc(100vw - 16px); max-height: 380px;
    border: 1px solid var(--border); border-radius: 8px; background: var(--popover); color: var(--fg); box-shadow: var(--shadow-lg); overflow: hidden; animation: in .12s ease-out; }
  .p-search { display: flex; align-items: center; gap: 8px; padding: 0 12px; border-bottom: 1px solid var(--border); color: var(--muted); }
  .p-search svg { width: 16px; height: 16px; }
  .p-search { height: 40px; font-size: 13px; }
  .p-query { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--muted); }
  .p-query strong { color: var(--fg); font-weight: 600; }
  .p-body { flex: 1; min-height: 0; overflow: auto; padding: 4px; }
  .p-section { padding: 8px 8px 4px; font-size: 11px; font-weight: 500; color: var(--muted); }
  .p-row { display: flex; align-items: center; gap: 10px; padding: 7px 8px; border-radius: 6px; cursor: pointer; }
  .p-row[aria-selected="true"] { background: var(--accent); }
  .p-row .p-kind { display: inline-grid; place-items: center; width: 28px; height: 28px; border: 1px solid var(--border); border-radius: 6px; color: var(--muted); background: var(--popover); }
  .p-row .p-kind svg { width: 14px; height: 14px; }
  .p-row .p-text { flex: 1; min-width: 0; display: grid; line-height: 1.3; }
  .p-row .p-title { font-size: 13px; font-weight: 500; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .p-row .p-meta { font-size: 12px; color: var(--muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .p-row .p-enter { color: var(--muted); opacity: 0; }
  .p-row[aria-selected="true"] .p-enter { opacity: 1; }
  .p-state { display: grid; gap: 10px; justify-items: start; padding: 14px 12px; font-size: 13px; }
  .p-state p { margin: 0; color: var(--muted); }
  .p-state strong { font-weight: 600; color: var(--fg); }
  .p-state .p-actions { display: flex; gap: 8px; flex-wrap: wrap; }
  .p-skeleton { height: 42px; margin: 4px; border-radius: 6px; background: var(--accent); animation: pulse 1.4s ease-in-out infinite; }
  .p-skeleton:nth-child(2) { animation-delay: .15s; } .p-skeleton:nth-child(3) { animation-delay: .3s; }
  .p-foot { display: flex; align-items: center; gap: 12px; padding: 6px 12px; border-top: 1px solid var(--border); font-size: 11px; color: var(--muted); }
  .p-foot kbd { font: inherit; padding: 0 4px; border: 1px solid var(--border); border-radius: 4px; }
  @keyframes pulse { 50% { opacity: .5; } }
`;

const KIND: Record<ItemSummary["kind"], { icon: IconName; label: string }> = {
  note: { icon: "fileText", label: "Note" },
  canvas: { icon: "shapes", label: "Canvas" },
  project: { icon: "folderKanban", label: "Project" },
};

type Row = { kind: "clips"; detail: CollectionDetail } | { kind: "item"; item: ItemSummary };

export interface PickerDeps {
  /** Shows a message on the page (the clipper's toast). */
  toast: (parts: (string | Node)[], options?: { error?: boolean; actions?: { label: string; variant?: "ghost" | "outline"; run: () => void }[] }) => void;
  strong: (s: string) => Node;
}

const ago = new Intl.RelativeTimeFormat(undefined, { numeric: "auto", style: "short" });
function since(iso: string) {
  const days = (Date.parse(iso) - Date.now()) / 86_400_000;
  if (!Number.isFinite(days)) return "";
  if (days > -1) {
    const hours = days * 24;
    return hours > -1 ? "just now" : ago.format(Math.round(hours), "hour");
  }
  return days > -30 ? ago.format(Math.round(days), "day") : new Date(iso).toLocaleDateString();
}

function dataUrlToFile(dataUrl: string, name: string): File | undefined {
  const m = /^data:(image\/[\w.+-]+);base64,(.+)$/.exec(dataUrl);
  if (!m) return undefined;
  const binary = atob(m[2]!);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new File([bytes], name, { type: m[1] });
}

const safeName = (s: string) => (s.replace(/[^\w\s-]+/g, "").trim().replace(/\s+/g, "-").slice(0, 60) || "canvas").toLowerCase();

export function createPicker(root: HTMLElement, deps: PickerDeps) {
  const box = document.createElement("div");
  box.className = "picker";
  box.setAttribute("role", "dialog");
  box.setAttribute("aria-label", "Add from Octonote");
  box.innerHTML = `
    <div class="p-search">${icon("search")}<span class="p-query" aria-live="polite"></span></div>
    <div class="p-body" role="listbox" aria-label="Octonote"></div>
    <div class="p-foot"><span><kbd>↑</kbd> <kbd>↓</kbd> to move</span><span><kbd>↵</kbd> to insert</span><span><kbd>esc</kbd> to close</span></div>`;
  box.style.pointerEvents = "auto";
  root.append(box);
  const queryText = box.querySelector<HTMLSpanElement>(".p-query")!;
  // The picker's host on the page: a click inside the (closed) shadow root only shows up as this.
  const host = (root.getRootNode() as ShadowRoot).host;
  const body = box.querySelector<HTMLDivElement>(".p-body")!;

  let editor: Editor | null = null;
  let spot: Spot | null = null;
  let rows: Row[] = [];
  let active = 0;
  let clips: CollectionDetail | null = null;
  let searchTimer = 0;
  let searchSeq = 0;
  let query = "";
  /** While asking how much of a long item to insert: what Enter and Esc do. */
  let confirming: { yes: () => void; no: () => void } | null = null;

  const el = <K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  };
  const button = (label: string, variant: "default" | "outline" | "ghost", run: () => void | Promise<void>) => {
    const b = el("button", `btn btn-${variant}`, label);
    b.type = "button";
    b.addEventListener("click", () => void run());
    return b;
  };

  const place = () => {
    if (!editor) return;
    const composer = editor.getBoundingClientRect();
    const at = spotRect(editor, spot);
    const width = Math.min(420, window.innerWidth - 16);
    box.style.width = `${width}px`;
    box.style.left = `${Math.max(8, Math.min(window.innerWidth - width - 8, Math.min(at.left, composer.left)))}px`;
    // Above the message box, unless it sits near the top of the page (a new chat).
    if (composer.top > 320) {
      box.style.top = "";
      box.style.bottom = `${window.innerHeight - composer.top + 8}px`;
    } else {
      box.style.bottom = "";
      box.style.top = `${composer.bottom + 8}px`;
    }
  };

  const isOpen = () => box.style.display === "flex";

  function close(refocus = true) {
    if (!isOpen()) return;
    box.style.display = "none";
    clearTimeout(searchTimer);
    confirming?.no();
    confirming = null;
    if (refocus && editor) editor.focus();
  }

  function showQuery() {
    queryText.replaceChildren();
    if (query) queryText.append("Searching Octonote for ", deps.strong(`“${query}”`));
    else queryText.append("Keep typing to search your notes, canvases and projects");
  }

  function state(parts: (string | Node)[], actions: HTMLElement[] = []) {
    const div = el("div", "p-state");
    const p = el("p");
    p.append(...parts);
    div.append(p);
    if (actions.length) {
      const row = el("div", "p-actions");
      row.append(...actions);
      div.append(row);
    }
    return div;
  }

  const openPanel = (tab?: "notes") => async () => {
    close();
    const opened = await send({ type: "openPanel", ...(tab ? { tab } : {}) }).catch(() => null);
    if (!opened?.ok) deps.toast([opened && !opened.ok ? opened.error : "Click the Octonote Clipper button in your toolbar."], { error: true });
  };

  function renderRows(note?: HTMLElement) {
    const nodes: HTMLElement[] = [];
    let index = 0;
    const section = (label: string) => nodes.push(el("div", "p-section", label));
    const rowNode = (row: Row) => {
      const i = index++;
      const r = el("div", "p-row");
      r.id = `p-row-${i}`;
      r.setAttribute("role", "option");
      r.setAttribute("aria-selected", String(i === active));
      const kind = el("span", "p-kind");
      const text = el("span", "p-text");
      if (row.kind === "clips") {
        kind.innerHTML = icon("scissors");
        const n = row.detail.clips.length;
        text.append(el("span", "p-title", `Clips from “${row.detail.name}”`), el("span", "p-meta", `${n} ${n === 1 ? "clip" : "clips"} you collected`));
      } else {
        kind.innerHTML = icon(KIND[row.item.kind].icon);
        const meta = [KIND[row.item.kind].label, row.item.notebook, since(row.item.updatedAt)].filter(Boolean).join(" · ");
        text.append(el("span", "p-title", row.item.title || "Untitled"), el("span", "p-meta", meta));
      }
      const enter = el("span", "p-enter");
      enter.innerHTML = icon("cornerDownLeft");
      r.append(kind, text, enter);
      r.addEventListener("mousemove", () => {
        if (active !== i) {
          active = i;
          highlight();
        }
      });
      r.addEventListener("mousedown", (e) => e.preventDefault());
      r.addEventListener("click", () => void choose(row));
      nodes.push(r);
    };
    const clipRows = rows.filter((r) => r.kind === "clips");
    const itemRows = rows.filter((r) => r.kind === "item");
    if (clipRows.length) {
      section("Your collection");
      clipRows.forEach(rowNode);
    }
    if (itemRows.length) {
      section(query ? "Results" : "Recent");
      itemRows.forEach(rowNode);
    }
    body.replaceChildren(...nodes, ...(note ? [note] : []));
    highlight();
  }

  function highlight() {
    body.querySelectorAll<HTMLElement>(".p-row").forEach((node, i) => node.setAttribute("aria-selected", String(i === active)));
    body.querySelector<HTMLElement>(`#p-row-${active}`)?.scrollIntoView({ block: "nearest" });
  }

  async function load() {
    const seq = ++searchSeq;
    const q = query;
    if (!rows.length) body.replaceChildren(el("div", "p-skeleton"), el("div", "p-skeleton"), el("div", "p-skeleton"));
    let result: Response;
    try {
      result = await send({ type: "items", q });
    } catch {
      return body.replaceChildren(state(["Octonote Clipper was updated. Reload this page to use it."]));
    }
    if (seq !== searchSeq) return;
    const clipRow: Row[] = !q && clips?.clips.length ? [{ kind: "clips", detail: clips }] : [];
    if (!result.ok) {
      rows = clipRow;
      active = 0;
      if (result.needsConnect)
        return body.replaceChildren(state(["Connect Octonote to insert your notes."], [button("Open Octonote panel", "default", openPanel())]));
      if (result.needsRead)
        return renderRows(
          state(
            [deps.strong("Insert notes, canvases and projects"), " — let Octonote Clipper read the ones you pick. It never reads anything else."],
            [button("Turn on", "default", openPanel("notes"))],
          ),
        );
      return renderRows(state([result.error]));
    }
    rows = [...clipRow, ...(result.items ?? []).map((item): Row => ({ kind: "item", item }))];
    active = Math.min(active, Math.max(0, rows.length - 1));
    renderRows(rows.length ? undefined : state([q ? `Nothing in Octonote matches “${q}”.` : "Nothing in this workspace yet."]));
  }

  async function open(target: Editor, where: Spot, q: string) {
    editor = target;
    spot = where;
    rows = [];
    active = 0;
    clips = null;
    query = q;
    showQuery();
    box.style.display = "flex";
    place();
    // The chosen collection's clips are offered first (they don't need note access).
    const current = await send({ type: "currentClips" }).catch(() => null);
    clips = current?.ok ? (current.clips ?? null) : null;
    await load();
  }

  /** Typing after #octonote searches; the spot grows with it. */
  function update(where: Spot, q: string) {
    spot = where;
    place();
    if (q === query || confirming) return;
    query = q;
    showQuery();
    active = 0;
    clearTimeout(searchTimer);
    searchTimer = window.setTimeout(() => void load(), 150);
  }

  // Keys steer the picker while focus stays in the message box. Capturing on window runs
  // before the editor's own handlers, so Enter inserts instead of sending the message.
  window.addEventListener(
    "keydown",
    (e) => {
      if (!isOpen() || e.isComposing) return;
      const steer = () => {
        e.preventDefault();
        e.stopImmediatePropagation();
      };
      if (confirming) {
        if (e.key === "Enter") steer(), confirming.yes();
        else if (e.key === "Escape") steer(), confirming.no();
        return;
      }
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        steer();
        if (!rows.length) return;
        active = (active + (e.key === "ArrowDown" ? 1 : -1) + rows.length) % rows.length;
        highlight();
      } else if ((e.key === "Enter" && !e.shiftKey) || e.key === "Tab") {
        const row = rows[active];
        if (!row) return;
        steer();
        void choose(row);
      } else if (e.key === "Escape") {
        steer();
        close();
      }
    },
    true,
  );
  // Clicking in the picker keeps the caret in the message box.
  box.addEventListener("mousedown", (e) => e.preventDefault());
  document.addEventListener(
    "mousedown",
    (e) => {
      if (isOpen() && !e.composedPath().includes(host)) close(false);
    },
    true,
  );
  window.addEventListener("resize", () => isOpen() && place());

  // --- Inserting ------------------------------------------------------------------------

  async function choose(row: Row) {
    if (row.kind === "clips") return insertClips(row.detail);
    return insertItem(row.item.id);
  }

  /** Asks how much of a long item to insert; resolves to whether to insert it all, or null for cancel. */
  function askLength(title: string, chars: number): Promise<boolean | null> {
    if (!editor) return Promise.resolve(null);
    if (!isOpen()) {
      box.style.display = "flex";
      place();
    }
    return new Promise((resolve) => {
      const done = (answer: boolean | null) => {
        confirming = null;
        resolve(answer);
      };
      confirming = { yes: () => done(false), no: () => done(null) };
      body.replaceChildren(
        state(
          [deps.strong(`“${title}” is ${chars.toLocaleString()} characters`), ", longer than chats handle well. The first part ends at a paragraph break and links to the rest."],
          [
            button(`Insert the first ${INSERT_LIMIT.toLocaleString()} characters`, "default", () => done(false)),
            button("Insert all of it", "outline", () => done(true)),
            button("Cancel", "ghost", () => done(null)),
          ],
        ),
      );
      queryText.replaceChildren("Enter inserts the first part · Esc cancels");
    });
  }

  async function put(text: (imageAttached: boolean) => string, image?: File) {
    if (!editor || !spot) return { text: false, image: false };
    close(false);
    try {
      return await insertInto(editor, spot, { text, image });
    } catch {
      return { text: false, image: false };
    }
  }

  async function insertItem(id: string) {
    body.replaceChildren(el("div", "p-skeleton"));
    const got = await send({ type: "item", id }).catch(() => null);
    if (!got?.ok || !got.item) {
      if (got && !got.ok && got.needsRead) return void (await load());
      close();
      return deps.toast([got && !got.ok ? got.error : "Couldn't get that from Octonote."], { error: true });
    }
    const item: ItemContent = got.item;
    let whole = item.markdown.length <= INSERT_LIMIT;
    if (!whole) {
      const choice = await askLength(item.title || "Untitled", item.markdown.length);
      if (choice === null) return close();
      whole = choice;
    }
    let image: File | undefined;
    if (item.hasImage) {
      const picture = await send({ type: "itemImage", id }).catch(() => null);
      if (picture?.ok && picture.image) image = dataUrlToFile(picture.image, `${safeName(item.title)}.png`);
    }
    const done = await put((withImage) => formatItem(item, { whole, withImage }), image);
    if (!done.text) return deps.toast(["Couldn't add it to this message box. Click into it and try again."], { error: true });
    deps.toast(
      image && !done.image
        ? ["Added ", deps.strong(item.title || "Untitled"), " as text. This chat didn't take the picture."]
        : ["Added ", deps.strong(item.title || "Untitled"), image ? " with its picture." : "."],
    );
  }

  async function insertClips(detail: CollectionDetail) {
    if (!detail.clips.length) return deps.toast(["That collection has no clips yet."], { error: true });
    let whole = clipsLength(detail.clips) <= INSERT_LIMIT;
    if (!whole) {
      const choice = await askLength(`Clips from “${detail.name}”`, clipsLength(detail.clips));
      if (choice === null) return close();
      whole = choice;
    }
    const done = await put(() => formatClips(detail.name, detail.clips, { whole }));
    if (!done.text) return deps.toast(["Couldn't add them to this message box. Click into it and try again."], { error: true });
    const n = detail.clips.length;
    deps.toast(["Added ", deps.strong(`${n} ${n === 1 ? "clip" : "clips"}`), ` from “${detail.name}”.`]);
  }

  return {
    open,
    update,
    close,
    isOpen,
    contains: (node: Node) => box.contains(node),
    /** From the side panel: insert straight away (asking only if it's long). */
    async insertItemAt(target: Editor, where: Spot, id: string) {
      editor = target;
      spot = where;
      await insertItem(id);
    },
    async insertClipsAt(target: Editor, where: Spot) {
      editor = target;
      spot = where;
      const current = await send({ type: "currentClips" }).catch(() => null);
      if (!current?.ok || !current.clips) return deps.toast([current && !current.ok ? current.error : "Couldn't get your clips."], { error: true });
      await insertClips(current.clips);
    },
  };
}
