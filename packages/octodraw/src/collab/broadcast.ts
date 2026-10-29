import { applyAwarenessUpdate, encodeAwarenessUpdate, removeAwarenessStates, type Awareness } from 'y-protocols/awareness';
import * as Y from 'yjs';

type Message = { type: 'update'; update: Uint8Array } | { type: 'hello'; stateVector: Uint8Array } | { type: 'awareness'; update: Uint8Array };

/**
 * Syncs a Y.Doc (and awareness) between browser tabs of the same origin with a
 * BroadcastChannel. For demos and local testing; real hosts use a server
 * provider (y-websocket, Hocuspocus, …) with the same Y.Doc.
 */
export function connectBroadcastChannel(ydoc: Y.Doc, awareness: Awareness | undefined, room: string): () => void {
  const channel = new BroadcastChannel(`octodraw:${room}`);
  const post = (message: Message) => channel.postMessage(message);

  const onUpdate = (update: Uint8Array, origin: unknown) => {
    if (origin !== channel) post({ type: 'update', update });
  };
  ydoc.on('update', onUpdate);

  const onAwareness = ({ added, updated, removed }: { added: number[]; updated: number[]; removed: number[] }, origin: unknown) => {
    if (!awareness || origin === channel) return;
    post({ type: 'awareness', update: encodeAwarenessUpdate(awareness, [...added, ...updated, ...removed]) });
  };
  awareness?.on('update', onAwareness);

  channel.onmessage = (event: MessageEvent<Message>) => {
    const message = event.data;
    if (message.type === 'update') Y.applyUpdate(ydoc, message.update, channel);
    else if (message.type === 'awareness' && awareness) applyAwarenessUpdate(awareness, message.update, channel);
    else if (message.type === 'hello') {
      // A tab joined: send what it's missing and who is here.
      post({ type: 'update', update: Y.encodeStateAsUpdate(ydoc, message.stateVector) });
      if (awareness) post({ type: 'awareness', update: encodeAwarenessUpdate(awareness, [...awareness.getStates().keys()]) });
    }
  };
  post({ type: 'hello', stateVector: Y.encodeStateVector(ydoc) });
  post({ type: 'update', update: Y.encodeStateAsUpdate(ydoc) });
  if (awareness) post({ type: 'awareness', update: encodeAwarenessUpdate(awareness, [ydoc.clientID]) });

  const leave = () => {
    if (awareness) removeAwarenessStates(awareness, [ydoc.clientID], 'leave');
  };
  window.addEventListener('pagehide', leave);
  return () => {
    // Our awareness state stays (the Awareness may be reconnected, e.g. React
    // StrictMode re-running effects); other tabs drop it when it goes stale.
    window.removeEventListener('pagehide', leave);
    ydoc.off('update', onUpdate);
    awareness?.off('update', onAwareness);
    channel.close();
  };
}
