/**
 * On ChatGPT, Claude and Gemini: select text and a "Clip" button appears;
 * hover an answer and "Clip answer" appears; Alt+Shift+C clips the selection.
 * Going the other way, typing #octonote in the message box (or clicking the
 * Octonote button by it) opens a picker to add notes, canvases, projects or
 * your collected clips to the message.
 * Clips go to the chosen Octonote collection as Markdown with where they came
 * from. Everything floats in a closed shadow root, so the site's styles and
 * scripts can't reach it, and it matches Octonote's design system in the
 * site's light or dark theme.
 */
import { caretSpot, composerOf, findComposer, triggerAtCaret, typeTrigger, type Editor } from "./composer";
import { icon } from "./icons";
import { fragmentToMarkdown, htmlToMarkdown } from "./markdown";
import { send, type Response, type TabCommand } from "./messages";
import { createPicker, PICKER_STYLE } from "./picker";
import { answerOf, siteFor, type Site } from "./sites";

/** The app's design tokens, light and dark (packages/design-tokens). */
const STYLE = `
  :host { all: initial; }
  .root { --primary: #191919; --primary-fg: #FFFFFF; --popover: #FFFFFF; --fg: #37352F; --muted: #73726E; --border: #E9E9E7; --accent: #F1F1EF; --input: #E3E2E0; --ring: #9B9A97; --destructive: #D44C47;
    --shadow-lg: 0 0 0 1px rgba(15,15,15,.04), 0 8px 24px rgba(15,15,15,.10), 0 24px 64px rgba(15,15,15,.08);
    font: 400 14px/1.4 Inter, ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif; -webkit-font-smoothing: antialiased; }
  .root.dark { --primary: #F5F5F4; --primary-fg: #0A0A0B; --popover: #141415; --fg: #EDEDEC; --muted: #8E8E8C; --border: #2A2A2D; --accent: #1C1C1E; --input: #2A2A2D; --ring: #5E5E5C; --destructive: #E5534B;
    --shadow-lg: 0 0 0 1px rgba(0,0,0,.4), 0 8px 24px rgba(0,0,0,.45); }
  svg { width: 14px; height: 14px; flex-shrink: 0; }
  .btn { display: inline-flex; align-items: center; justify-content: center; gap: 6px; height: 32px; padding: 0 12px; border: 1px solid transparent; border-radius: 6px;
    font: inherit; font-size: 13px; font-weight: 500; line-height: 1; white-space: nowrap; cursor: pointer; transition: background-color .15s ease, opacity .15s ease; }
  .btn:focus-visible { outline: none; box-shadow: 0 0 0 2px var(--popover), 0 0 0 4px var(--ring); }
  .btn-default { background: var(--primary); color: var(--primary-fg); }
  .btn-default:hover { opacity: .9; }
  .btn-ghost { background: transparent; color: var(--fg); }
  .btn-ghost:hover { background: var(--accent); }
  .btn-outline { background: var(--popover); color: var(--fg); border-color: var(--input); }
  .btn-outline:hover { background: var(--accent); }
  .btn-icon { width: 28px; height: 28px; padding: 0; color: var(--muted); }
  .float { position: fixed; z-index: 1; display: none; box-shadow: var(--shadow-lg); animation: in .12s ease-out; }
  .float[data-state="busy"] svg { animation: spin 1s linear infinite; }
  .float[data-state="busy"] { pointer-events: none; }
  .add-octonote { position: fixed; z-index: 1; display: none; width: 28px; height: 28px; padding: 0; color: var(--fg); box-shadow: var(--shadow-lg); }
  .add-octonote svg { width: 15px; height: 15px; }
  .toast { position: fixed; right: 20px; bottom: 20px; z-index: 2; display: none; align-items: center; gap: 8px; max-width: 400px; min-height: 44px; padding: 6px 6px 6px 12px;
    border: 1px solid var(--border); border-radius: 8px; background: var(--popover); color: var(--fg); box-shadow: var(--shadow-lg); font-size: 13px; animation: rise .18s ease-out; }
  .toast .text { flex: 1; min-width: 0; }
  .toast .text strong { font-weight: 600; }
  .toast .mark { display: inline-grid; color: var(--fg); }
  .toast.error .mark { color: var(--destructive); }
  .toast svg { width: 16px; height: 16px; }
  @keyframes in { from { opacity: 0; transform: translateY(2px) scale(.98); } }
  @keyframes rise { from { opacity: 0; transform: translateY(6px); } }
  @keyframes spin { to { transform: rotate(360deg); } }
  @media (prefers-reduced-motion: reduce) { * { animation: none !important; transition: none !important; } }
`;

/** Whether the site is showing a dark theme, from its background colour. */
function siteIsDark() {
  for (const node of [document.body, document.documentElement]) {
    if (!node) continue;
    const m = /rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?/.exec(getComputedStyle(node).backgroundColor);
    if (m && (m[4] === undefined || Number(m[4]) > 0.5))
      return 0.2126 * Number(m[1]) + 0.7152 * Number(m[2]) + 0.0722 * Number(m[3]) < 128;
  }
  return matchMedia("(prefers-color-scheme: dark)").matches;
}

function start(site: Site) {
  const host = document.createElement("octonote-clipper");
  host.style.cssText = "position:fixed;inset:0;pointer-events:none;z-index:2147483647;";
  const shadow = host.attachShadow({ mode: "closed" });
  shadow.innerHTML = `<style>${STYLE}${PICKER_STYLE}</style>
    <div class="root">
      <button class="btn btn-default float selection" type="button" aria-label="Clip the selection to Octonote">${icon("scissors")}<span>Clip</span></button>
      <button class="btn btn-default float answer" type="button" aria-label="Clip this whole answer to Octonote">${icon("scissors")}<span>Clip answer</span></button>
      <button class="btn btn-outline add-octonote" type="button" aria-label="Add from Octonote" title="Add from Octonote (or type #octonote)">${icon("hash")}</button>
      <div class="toast" role="status" aria-live="polite"></div>
    </div>`;
  document.documentElement.appendChild(host);
  const root = shadow.querySelector<HTMLDivElement>(".root")!;
  const selectionButton = shadow.querySelector<HTMLButtonElement>(".selection")!;
  const answerButton = shadow.querySelector<HTMLButtonElement>(".answer")!;
  const toastBox = shadow.querySelector<HTMLDivElement>(".toast")!;
  const addButton = shadow.querySelector<HTMLButtonElement>(".add-octonote")!;
  for (const node of [selectionButton, answerButton, toastBox, addButton]) node.style.pointerEvents = "auto";
  let hovered: HTMLElement | null = null;
  let toastTimer = 0;

  const theme = () => root.classList.toggle("dark", siteIsDark());
  theme();
  new MutationObserver(theme).observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["class", "style", "data-theme"],
  });
  matchMedia("(prefers-color-scheme: dark)").addEventListener("change", theme);

  const source = () => {
    const title = site.title(document.title);
    return { app: site.app, url: location.href.split("#")[0], ...(title ? { title } : {}) };
  };

  // --- Toast ----------------------------------------------------------------------------

  type Action = { label: string; variant?: "ghost" | "outline"; run: () => void };
  const hideToast = () => void (toastBox.style.display = "none");
  const toast = (parts: (string | Node)[], options: { error?: boolean; actions?: Action[] } = {}) => {
    toastBox.replaceChildren();
    toastBox.classList.toggle("error", !!options.error);
    const mark = document.createElement("span");
    mark.className = "mark";
    mark.innerHTML = icon(options.error ? "alert" : "check");
    const text = document.createElement("span");
    text.className = "text";
    text.append(...parts);
    toastBox.append(mark, text);
    for (const action of options.actions ?? []) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = `btn btn-${action.variant ?? "ghost"}`;
      button.textContent = action.label;
      button.addEventListener("click", action.run);
      toastBox.append(button);
    }
    const close = document.createElement("button");
    close.type = "button";
    close.className = "btn btn-ghost btn-icon";
    close.setAttribute("aria-label", "Dismiss");
    close.innerHTML = icon("x");
    close.addEventListener("click", hideToast);
    toastBox.append(close);
    toastBox.style.display = "flex";
    clearTimeout(toastTimer);
    toastTimer = window.setTimeout(hideToast, options.actions?.length ? 7000 : 4000);
  };
  const strong = (s: string) => {
    const b = document.createElement("strong");
    b.textContent = s;
    return b;
  };
  const openPanel: Action = {
    label: "Open panel",
    variant: "outline",
    run: async () => {
      hideToast();
      const opened = await send({ type: "openPanel" }).catch(() => null);
      if (!opened?.ok) toast([opened && !opened.ok ? opened.error : "Click the Octonote Clipper button in your toolbar."], { error: true });
    },
  };

  // --- Clipping ---------------------------------------------------------------------------

  const clip = async (content: string): Promise<boolean> => {
    if (!content.trim()) return false;
    let result: Response;
    try {
      result = await send({ type: "clip", content, source: source() });
    } catch {
      // The extension was updated or reloaded: this page's script is stale.
      toast(["Octonote Clipper was updated. Reload this page to keep clipping."], { error: true });
      return false;
    }
    if (result.ok) {
      const clipId = result.clipId!;
      toast(["Clipped to ", strong(result.collectionName ?? "your collection")], {
        actions: [
          {
            label: "Undo",
            run: async () => {
              const undone = await send({ type: "undoClip", id: clipId }).catch(() => null);
              if (undone?.ok) toast(["Clip removed."]);
              else toast([undone && !undone.ok ? undone.error : "Couldn't undo."], { error: true });
            },
          },
          openPanel,
        ],
      });
      return true;
    }
    if (result.needsConnect) toast(["Connect Octonote to start clipping."], { error: true, actions: [openPanel] });
    else if (result.needsCollection) toast(["Choose a collection to clip into."], { error: true, actions: [openPanel] });
    else toast([result.error], { error: true });
    return false;
  };

  const setState = (button: HTMLButtonElement, state: "busy" | "done" | null, label: string) => {
    if (state) button.dataset.state = state;
    else delete button.dataset.state;
    button.innerHTML = `${icon(state === "busy" ? "loader" : state === "done" ? "check" : "scissors")}<span></span>`;
    button.querySelector("span")!.textContent = label;
  };

  const selectionMarkdown = () => {
    const selection = window.getSelection();
    if (!selection?.rangeCount || selection.isCollapsed) return "";
    return fragmentToMarkdown(selection.getRangeAt(0).cloneContents()) || selection.toString();
  };

  // "Clip" above the end of a selection.
  const placeSelectionButton = () => {
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed || !selection.rangeCount || !selection.toString().trim())
      return void (selectionButton.style.display = "none");
    const rect = selection.getRangeAt(0).getBoundingClientRect();
    if (!rect.width && !rect.height) return void (selectionButton.style.display = "none");
    selectionButton.style.display = "inline-flex";
    const width = selectionButton.offsetWidth || 72;
    selectionButton.style.top = `${Math.max(8, rect.top - 40)}px`;
    selectionButton.style.left = `${Math.min(window.innerWidth - width - 8, Math.max(8, rect.right - width))}px`;
  };
  document.addEventListener("selectionchange", () => requestAnimationFrame(placeSelectionButton));
  window.addEventListener(
    "scroll",
    () => {
      selectionButton.style.display = "none";
      // The answer button is placed again on the next hover.
      if (!answerButton.dataset.state) {
        answerButton.style.display = "none";
        hovered = null;
      }
    },
    { passive: true, capture: true },
  );
  // Keep the selection when the button is pressed.
  selectionButton.addEventListener("mousedown", (e) => e.preventDefault());
  selectionButton.addEventListener("click", async () => {
    const content = selectionMarkdown();
    setState(selectionButton, "busy", "Clipping…");
    const ok = await clip(content);
    setState(selectionButton, null, "Clip");
    if (ok) {
      selectionButton.style.display = "none";
      window.getSelection()?.removeAllRanges();
    }
  });

  // "Clip answer" at the top-right corner of the answer under the pointer.
  document.addEventListener(
    "mouseover",
    (e) => {
      // Moving onto our own button isn't leaving the answer.
      if (e.composedPath().includes(host) || answerButton.dataset.state) return;
      const answer = answerOf(e.target as Node, site);
      if (answer === hovered) return;
      hovered = answer;
      if (!answer) return void (answerButton.style.display = "none");
      const rect = answer.getBoundingClientRect();
      answerButton.style.display = "inline-flex";
      const width = answerButton.offsetWidth || 120;
      answerButton.style.top = `${Math.max(8, rect.top + 8)}px`;
      answerButton.style.left = `${Math.min(window.innerWidth - width - 8, rect.right - width - 8)}px`;
    },
    { passive: true },
  );
  answerButton.addEventListener("click", async () => {
    if (!hovered) return;
    setState(answerButton, "busy", "Clipping…");
    const ok = await clip(htmlToMarkdown(hovered));
    setState(answerButton, ok ? "done" : null, ok ? "Clipped" : "Clip answer");
    setTimeout(
      () => {
        setState(answerButton, null, "Clip answer");
        answerButton.style.display = "none";
        hovered = null;
      },
      ok ? 1400 : 0,
    );
  });

  // --- Adding from Octonote --------------------------------------------------------

  const picker = createPicker(root, { toast, strong });

  // "#octonote" typed in the message box opens the picker; typing after it searches.
  let byTrigger = false;
  const followTrigger = (editor: Editor) => {
    const found = triggerAtCaret(editor);
    if (found) {
      if (picker.isOpen()) picker.update(found.spot, found.query);
      else {
        byTrigger = true;
        void picker.open(editor, found.spot, found.query);
      }
    } else if (picker.isOpen() && byTrigger) picker.close(false);
  };
  document.addEventListener(
    "input",
    (e) => {
      const editor = composerOf(e.composedPath()[0] ?? e.target, site);
      if (!editor) return;
      followTrigger(editor);
      requestAnimationFrame(placeAddButton);
    },
    true,
  );
  // Moving the caret away from "#octonote" closes it.
  document.addEventListener("selectionchange", () => {
    if (!picker.isOpen() || !byTrigger) return;
    const editor = composerOf(document.getSelection()?.anchorNode ?? null, site);
    if (editor) followTrigger(editor);
  });

  /** The visible message box around the editable area (the rounded box people see). */
  const frameOf = (editor: HTMLElement) => {
    let frame = editor;
    for (let el = editor.parentElement; el && el !== document.body; el = el.parentElement) {
      const r = el.getBoundingClientRect();
      if (r.height > 320 || r.width > window.innerWidth * 0.95) break;
      frame = el;
    }
    return frame;
  };

  // The Octonote button sits on the message box's top-right corner while it has focus.
  let focused: HTMLElement | null = null;
  const placeAddButton = () => {
    if (!focused?.isConnected) return void (addButton.style.display = "none");
    const r = frameOf(focused).getBoundingClientRect();
    if (!r.width) return void (addButton.style.display = "none");
    addButton.style.display = "inline-flex";
    // Straddling the box's top edge, in from the corner, clear of the site's own text above it.
    addButton.style.top = `${Math.max(8, r.top - 14)}px`;
    addButton.style.left = `${Math.min(window.innerWidth - 36, r.right - 56)}px`;
  };
  // The box grows as you type or insert; follow it.
  const frameWatcher = new ResizeObserver(placeAddButton);
  document.addEventListener("focusin", (e) => {
    const editor = composerOf(e.composedPath()[0] ?? e.target, site);
    if (editor) {
      focused = editor;
      frameWatcher.disconnect();
      frameWatcher.observe(frameOf(editor));
      placeAddButton();
    }
  });
  document.addEventListener("focusout", () => {
    setTimeout(() => {
      if (!composerOf(document.activeElement, site) && !picker.isOpen()) {
        focused = null;
        addButton.style.display = "none";
      }
    }, 150);
  });
  window.addEventListener("resize", placeAddButton);
  window.addEventListener("scroll", placeAddButton, { passive: true, capture: true });
  new ResizeObserver(placeAddButton).observe(document.documentElement);
  // Keep the caret where it is in the message box.
  addButton.addEventListener("mousedown", (e) => e.preventDefault());
  addButton.addEventListener("click", () => {
    const editor = focused ?? findComposer(site);
    if (!editor) return;
    // Type "#octonote" for the person: the picker opens, and they can keep typing to search.
    typeTrigger(editor);
    setTimeout(() => followTrigger(editor), 0);
  });

  // From the worker: the clip shortcut, and inserts chosen in the side panel.
  chrome.runtime.onMessage.addListener((message: TabCommand, _sender, reply: (r: { app: string }) => void) => {
    if (message?.command === "ping") {
      reply({ app: site.app });
      return false;
    }
    if (message?.command === "clipSelection") {
      const content = selectionMarkdown();
      if (!content.trim()) toast(["Select some text first, then press the shortcut."], { error: true });
      else void clip(content);
    } else if (message?.command === "insertItem" || message?.command === "insertClips") {
      const editor = findComposer(site);
      if (!editor) {
        toast(["Open a chat with a message box first."], { error: true });
        return false;
      }
      const spot = caretSpot(editor);
      byTrigger = false;
      if (message.command === "insertItem") void picker.insertItemAt(editor, spot, message.id);
      else void picker.insertClipsAt(editor, spot);
    }
    return false;
  });
}

// Last, so everything above is defined when it runs.
const site = siteFor(location.hostname);
if (site) start(site);
