// octodraw/collab: real-time collaboration on top of Yjs. A separate entry so
// hosts that don't collaborate don't bundle Yjs.
export { Awareness } from 'y-protocols/awareness';
export * as Y from 'yjs';
export { connectBroadcastChannel } from './broadcast';
export { VERSIONS_KEY, yjsVersionStore } from './versions';
export { assignZ, CanvasSync, COMMENTS_KEY, ITEMS_KEY, META_KEY, readCanvas, seedCanvas, updateText, writeCanvas, type CanvasSyncOptions } from './sync';
export { colorForUser, useCollaborativeCanvas, type CanvasPeer, type CanvasPresence, type CollabUser } from './useCollaborativeCanvas';
