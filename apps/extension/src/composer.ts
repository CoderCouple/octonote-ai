/**
 * Working with a chat site's message box: finding it, spotting "#octonote"
 * (and a search after it) before the caret, and putting text and images in.
 *
 * Inserting goes through a paste event, the way the sites' own editors
 * (ProseMirror on ChatGPT and Claude, Quill on Gemini) expect content to
 * arrive, so they keep their own state right; if an editor ignores the
 * paste, text falls back to the browser's insertText command.
 */
import type { Site } from "./sites";

/** Typed in a message box to add from Octonote; anything after it (on the same line) searches. */
export const TRIGGER = "#octonote";
const TRIGGER_AT_CARET = /(^|\s)#octonote((?:[ \t][^\n#]{0,60})?)$/i;

export type Editor = HTMLElement;

/** Where to put the insert: the "#octonote" typed (and its search), or the caret. */
export type Spot =
  | { kind: "range"; range: Range }
  | { kind: "textarea"; start: number; end: number };

const visible = (el: Element) => {
  const r = el.getBoundingClientRect();
  return r.width > 0 && r.height > 0;
};

export function findComposer(site: Site): Editor | null {
  for (const selector of site.composers)
    for (const el of document.querySelectorAll<HTMLElement>(selector))
      if (visible(el)) return el;
  return null;
}

/** The message box an element belongs to, if it's one. */
export function composerOf(node: EventTarget | null, site: Site): Editor | null {
  const el = node instanceof Element ? node : node instanceof Node ? node.parentElement : null;
  if (!el) return null;
  for (const selector of site.composers) {
    const found = el.closest<HTMLElement>(selector);
    if (found) return found;
  }
  return null;
}

const isTextarea = (el: Editor): el is HTMLTextAreaElement => el instanceof HTMLTextAreaElement;

/** "#octonote" (plus any search typed after it) just before the caret: the spot to replace, and the search. */
export function triggerAtCaret(editor: Editor): { spot: Spot; query: string } | null {
  if (isTextarea(editor)) {
    const end = editor.selectionStart ?? 0;
    if (editor.selectionEnd !== end) return null;
    const m = TRIGGER_AT_CARET.exec(editor.value.slice(0, end));
    if (!m) return null;
    return { spot: { kind: "textarea", start: end - m[0].length + m[1]!.length, end }, query: m[2]!.trim() };
  }
  const selection = editor.ownerDocument.getSelection();
  if (!selection?.rangeCount || !selection.isCollapsed) return null;
  const { startContainer: node, startOffset: offset } = selection.getRangeAt(0);
  if (node.nodeType !== Node.TEXT_NODE || !editor.contains(node)) return null;
  const m = TRIGGER_AT_CARET.exec((node.textContent ?? "").slice(0, offset));
  if (!m) return null;
  const range = editor.ownerDocument.createRange();
  range.setStart(node, offset - m[0].length + m[1]!.length);
  range.setEnd(node, offset);
  return { spot: { kind: "range", range }, query: m[2]!.trim() };
}

/** Types "#octonote" at the caret (with a space before it if needed), as if the person had. */
export function typeTrigger(editor: Editor) {
  editor.focus();
  if (isTextarea(editor)) {
    const at = editor.selectionStart ?? editor.value.length;
    const before = editor.value.slice(0, at);
    const text = `${before && !/\s$/.test(before) ? " " : ""}${TRIGGER}`;
    editor.setRangeText(text, at, editor.selectionEnd ?? at, "end");
    editor.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: text }));
    return;
  }
  const selection = editor.ownerDocument.getSelection();
  if (!selection?.rangeCount || !editor.contains(selection.getRangeAt(0).commonAncestorContainer)) {
    const range = editor.ownerDocument.createRange();
    range.selectNodeContents(editor);
    range.collapse(false);
    selection?.removeAllRanges();
    selection?.addRange(range);
  }
  const range = selection!.getRangeAt(0);
  const node = range.startContainer;
  const before = node.nodeType === Node.TEXT_NODE ? (node.textContent ?? "").slice(0, range.startOffset) : "";
  editor.ownerDocument.execCommand("insertText", false, `${before && !/\s$/.test(before) ? " " : ""}${TRIGGER}`);
}

/** Where the caret is now (or the end of the box). */
export function caretSpot(editor: Editor): Spot {
  if (isTextarea(editor)) {
    const at = editor.selectionStart ?? editor.value.length;
    return { kind: "textarea", start: at, end: editor.selectionEnd ?? at };
  }
  const selection = editor.ownerDocument.getSelection();
  if (selection?.rangeCount && editor.contains(selection.getRangeAt(0).commonAncestorContainer))
    return { kind: "range", range: selection.getRangeAt(0).cloneRange() };
  const range = editor.ownerDocument.createRange();
  range.selectNodeContents(editor);
  range.collapse(false);
  return { kind: "range", range };
}

/** The screen box to place the picker by. */
export function spotRect(editor: Editor, spot: Spot | null): DOMRect {
  if (spot?.kind === "range") {
    const r = spot.range.getBoundingClientRect();
    if (r.width || r.height || r.top) return r;
  }
  return editor.getBoundingClientRect();
}

/** Selects the spot in the box, ready to be replaced. */
function select(editor: Editor, spot: Spot) {
  editor.focus();
  if (spot.kind === "textarea" && isTextarea(editor)) {
    editor.setSelectionRange(spot.start, spot.end);
    return;
  }
  if (spot.kind === "range") {
    const selection = editor.ownerDocument.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(spot.range);
  }
}

function paste(editor: Editor, data: DataTransfer): boolean {
  const event = new ClipboardEvent("paste", { clipboardData: data, bubbles: true, cancelable: true, composed: true });
  // Editors handle a paste they understand and cancel the browser's own.
  editor.dispatchEvent(event);
  return event.defaultPrevented;
}

function insertTextarea(editor: HTMLTextAreaElement, text: string, spot: Spot) {
  const [start, end] = spot.kind === "textarea" ? [spot.start, spot.end] : [editor.value.length, editor.value.length];
  editor.focus();
  editor.setRangeText(text, start, end, "end");
  editor.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertFromPaste", data: text }));
}

/** Lets the editor catch up: ProseMirror and Quill read DOM selection changes on their next tick. */
const tick = () => new Promise<void>((resolve) => requestAnimationFrame(() => setTimeout(resolve, 0)));

/**
 * Replaces the spot with an image (if any) and then the text, the way a paste
 * would: the editor sees the spot selected and pastes over it. Returns what
 * made it in; an editor that won't take pasted images just gets the text.
 */
export async function insertInto(
  editor: Editor,
  spot: Spot,
  content: { text: (imageAttached: boolean) => string; image?: File },
): Promise<{ text: boolean; image: boolean }> {
  if (isTextarea(editor)) {
    insertTextarea(editor, content.text(false), spot);
    return { text: true, image: false };
  }
  select(editor, spot);
  await tick();
  let image = false;
  if (content.image) {
    const data = new DataTransfer();
    data.items.add(content.image);
    image = paste(editor, data);
    await tick();
    // Attaching a file leaves the text alone; select the spot again in case the editor moved the caret.
    if (spot.kind === "range" && spot.range.startContainer.isConnected) {
      select(editor, spot);
      await tick();
    }
  }
  // The text can say whether the picture made it in.
  const words = content.text(image);
  const data = new DataTransfer();
  data.setData("text/plain", words);
  let text = paste(editor, data);
  if (!text) text = editor.ownerDocument.execCommand("insertText", false, words);
  return { text, image };
}
