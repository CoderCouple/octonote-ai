import { useEffect, useMemo, useState } from 'react';
import { localVersionStore, useCanvasHistory, type CanvasDocument, type CanvasPeer, type VersionStore } from '@octonote/octodraw';
import { Awareness, connectBroadcastChannel, seedCanvas, useCollaborativeCanvas, yjsVersionStore, Y, type CanvasPresence, type CollabUser } from '@octonote/octodraw/collab';
import { load, save } from './storage';

// Live mode for the playground: open the page with ?room=<name> and every tab
// in this browser with the same room edits the same canvas (BroadcastChannel).
// octonote would use a server provider instead; the canvas binding is the same.

export const ROOM = new URLSearchParams(location.search).get('room');

export interface PlaygroundCanvas {
  doc: CanvasDocument;
  change: (doc: CanvasDocument, meta?: { silent?: boolean }) => void;
  undo: () => void;
  redo: () => void;
  peers: CanvasPeer[];
  user?: CollabUser & { color: string };
  setPresence?: (presence: Partial<CanvasPresence>) => void;
  /** Where versions are kept: the shared room (everyone sees them) or this browser. */
  versions: VersionStore;
}

const NAMES = ['Ada', 'Grace', 'Linus', 'Margaret', 'Alan', 'Barbara', 'Ken', 'Radia', 'Edsger', 'Frances'];
const COLORS = ['#e5484d', '#f76b15', '#30a46c', '#12a594', '#0090ff', '#6e56cf', '#d6409f'];

/** A name per tab (sessionStorage), so two tabs show up as two people. */
function tabUser(): CollabUser & { color: string } {
  try {
    const saved = JSON.parse(sessionStorage.getItem('octodraw.user') ?? 'null');
    if (saved?.id) return saved;
  } catch {
    // New user below.
  }
  const n = Math.floor(Math.random() * 1000);
  const user = { id: `u${Date.now().toString(36)}${n}`, name: NAMES[n % NAMES.length]!, color: COLORS[n % COLORS.length]! };
  try {
    sessionStorage.setItem('octodraw.user', JSON.stringify(user));
  } catch {
    // Not persisted.
  }
  return user;
}

const toBase64 = (bytes: Uint8Array) => btoa(Array.from(bytes, (b) => String.fromCharCode(b)).join(''));
const fromBase64 = (text: string) => Uint8Array.from(atob(text), (c) => c.charCodeAt(0));

function useLiveCanvas(room: string, initial: () => CanvasDocument): PlaygroundCanvas {
  const key = `octodraw.room.${room}`;
  const [{ ydoc, awareness }] = useState(() => {
    const ydoc = new Y.Doc();
    const saved = load(key);
    if (saved) Y.applyUpdate(ydoc, fromBase64(saved));
    return { ydoc, awareness: new Awareness(ydoc) };
  });
  const user = useMemo(tabUser, []);
  const versions = useMemo(() => yjsVersionStore(ydoc), [ydoc]);
  useEffect(() => connectBroadcastChannel(ydoc, awareness, room), [ydoc, awareness, room]);
  useEffect(() => {
    // Give other tabs a moment to send the room; if it's still empty, start it from this tab's canvas.
    const timer = setTimeout(() => seedCanvas(ydoc, initial()), 400);
    let pending = 0;
    const persist = () => {
      clearTimeout(pending);
      pending = window.setTimeout(() => save(key, toBase64(Y.encodeStateAsUpdate(ydoc))), 500);
    };
    ydoc.on('update', persist);
    return () => {
      clearTimeout(timer);
      ydoc.off('update', persist);
    };
  }, [ydoc, key, initial]);
  const live = useCollaborativeCanvas({ ydoc, awareness, user });
  return { doc: live.doc, change: live.onChange, undo: live.undo, redo: live.redo, peers: live.peers, user, setPresence: live.setPresence, versions };
}

function useLocalCanvas(initial: () => CanvasDocument): PlaygroundCanvas {
  const { doc, change, undo, redo } = useCanvasHistory(initial);
  const versions = useMemo(() => localVersionStore('octodraw.versions'), []);
  return { doc, change, undo, redo, peers: [], versions };
}

/** Local undo history, or the shared room when the URL names one (fixed for the page's lifetime). */
export const usePlaygroundCanvas: (initial: () => CanvasDocument) => PlaygroundCanvas = ROOM ? (initial) => useLiveCanvas(ROOM, initial) : useLocalCanvas;

/** Opens the current canvas as a new live room in this tab. */
export function startLiveRoom(): string {
  const room = Math.random().toString(36).slice(2, 8);
  const url = new URL(location.href);
  url.searchParams.set('room', room);
  location.href = url.toString();
  return room;
}
