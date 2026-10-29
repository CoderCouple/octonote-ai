import { useCallback, useEffect, useMemo, useRef, useSyncExternalStore } from 'react';
import type { Awareness } from 'y-protocols/awareness';
import type * as Y from 'yjs';
import type { Box, CanvasPeer, Point } from '../canvas/model';
import type { CanvasChangeMeta } from '../canvas/useCanvasHistory';
import { CanvasSync } from './sync';

export type { CanvasPeer };

export interface CollabUser {
  id: string;
  name: string;
  /** Cursor and selection colour; picked from the id when left out. */
  color?: string;
}

export interface CanvasPresence {
  cursor: Point | null;
  selection: string[];
  view: Box;
  code: CanvasPeer['code'];
  laser: boolean;
  following: string | null;
  followingSince?: number;
}

const PEER_COLORS = ['#e5484d', '#f76b15', '#ffc53d', '#30a46c', '#12a594', '#0090ff', '#6e56cf', '#d6409f'];

export function colorForUser(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) | 0;
  return PEER_COLORS[Math.abs(hash) % PEER_COLORS.length]!;
}

/**
 * Binds OctoCanvas to a shared Y.Doc: pass `doc`, `onChange`, `onUndo`/`onRedo`,
 * `peers` and `onPresenceChange` straight to the canvas. The host owns the
 * Y.Doc, its provider (transport) and persistence.
 */
export function useCollaborativeCanvas({ ydoc, awareness, user }: { ydoc: Y.Doc; awareness?: Awareness; user: CollabUser }) {
  const sync = useMemo(() => new CanvasSync(ydoc), [ydoc]);
  useEffect(() => {
    // Reconnect too: React StrictMode runs this cleanup once before the real mount.
    sync.connect();
    return () => sync.destroy();
  }, [sync]);
  const doc = useSyncExternalStore(sync.subscribe, () => sync.doc);
  // canUndo/canRedo change with the undo stack; read them on each render after a notify.
  useSyncExternalStore(sync.subscribe, () => `${sync.canUndo}:${sync.canRedo}`);

  const onChange = useCallback((next: Parameters<CanvasSync['apply']>[0], meta?: CanvasChangeMeta) => sync.apply(next, meta), [sync]);
  const undo = useCallback(() => sync.undo(), [sync]);
  const redo = useCallback(() => sync.redo(), [sync]);

  // ---- presence ----
  const color = user.color ?? colorForUser(user.id);
  useEffect(() => {
    if (!awareness) return;
    // setLocalStateField does nothing once the local state was cleared, so set the whole state.
    awareness.setLocalState({ ...(awareness.getLocalState() ?? {}), user: { id: user.id, name: user.name, color } });
  }, [awareness, user.id, user.name, color]);

  const peersRef = useRef<CanvasPeer[]>([]);
  const subscribePeers = useCallback(
    (listener: () => void) => {
      if (!awareness) return () => {};
      const onChange = () => {
        const peers: CanvasPeer[] = [];
        awareness.getStates().forEach((state, clientId) => {
          if (clientId === awareness.clientID || !state.user) return;
          peers.push({ clientId, ...state.user, cursor: state.cursor ?? null, selection: state.selection ?? [], view: state.view, code: state.code ?? null, laser: !!state.laser, following: state.following ?? null, followingSince: state.followingSince });
        });
        peersRef.current = peers;
        listener();
      };
      onChange();
      awareness.on('change', onChange);
      return () => awareness.off('change', onChange);
    },
    [awareness],
  );
  const peers = useSyncExternalStore(subscribePeers, () => peersRef.current);

  const setPresence = useCallback(
    (presence: Partial<CanvasPresence>) => {
      if (!awareness) return;
      const state = awareness.getLocalState() ?? {};
      awareness.setLocalState({ ...state, ...presence });
    },
    [awareness],
  );

  return { doc, onChange, undo, redo, canUndo: sync.canUndo, canRedo: sync.canRedo, peers, setPresence, sync };
}
