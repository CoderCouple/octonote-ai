import type { ItemContent } from "./insert-format";

export type { ItemContent };

/** Messages between the extension's parts. The background worker owns the connection and is the only part that talks to Octonote. */
export type ClipApp =
  "chatgpt" | "claude" | "gemini" | "octonote" | "web" | "other";

export interface ClipSource {
  app: ClipApp;
  url?: string;
  title?: string;
}

/** What's kept in storage. The token never leaves the worker. */
export interface Connection {
  env: string;
  token: string;
  workspaceId: string;
  workspaceName?: string;
  collectionId?: string;
  collectionName?: string;
  /** "clipper_read" when the person let the extension read notes they insert into chats. */
  scope?: "clipper" | "clipper_read";
}

/** What the panel is told about the connection. */
export interface ConnectionInfo {
  env: string;
  envLabel: string;
  webUrl: string;
  workspaceId: string;
  workspaceName?: string;
  collectionId?: string;
  collectionName?: string;
  /** Whether notes, canvases and projects can be inserted into chats. */
  canRead: boolean;
}

export interface CollectionSummary {
  id: string;
  name: string;
  clips: number;
  updatedAt?: string;
}

export interface ClipRow {
  id: string;
  content: string;
  source: ClipSource | null;
  position: number;
  createdAt: string;
}

export interface CollectionDetail {
  id: string;
  name: string;
  clips: ClipRow[];
}

export interface ItemSummary {
  id: string;
  kind: "note" | "canvas" | "project";
  title: string;
  updatedAt: string;
  notebook: string | null;
}

export interface Status {
  connection: ConnectionInfo | null;
  /** A connect started from the panel and not finished yet. */
  pending: { env: string; envLabel: string; url: string } | null;
  /** Why the last connection ended, if it ended on its own (revoked or expired). */
  ended: string | null;
  environments: { id: string; label: string }[];
  /** The panel tab something asked to show ("notes" after "Turn on" in a chat). */
  tab: "clips" | "notes" | null;
}

/** From the side panel (extension pages only). */
export type PanelRequest =
  | { type: "status" }
  | { type: "beginConnect"; env: string; read: boolean }
  | { type: "cancelConnect" }
  | { type: "disconnect" }
  | { type: "collections" }
  | { type: "useCollection"; id: string | null; name?: string }
  | { type: "createCollection"; name: string }
  | { type: "renameCollection"; name: string }
  | { type: "collection" }
  | { type: "reorder"; ids: string[] }
  | { type: "restoreClip"; content: string; source: ClipSource; collectionId: string }
  | { type: "removeClip"; id: string }
  /** Puts an item (or the chosen collection's clips) into the chat in the active tab. */
  | { type: "insertIntoTab"; id?: string; clips?: boolean };

/** From the clipper on ChatGPT, Claude and Gemini. */
export type ClipperRequest =
  | { type: "clip"; content: string; source: ClipSource }
  | { type: "undoClip"; id: string }
  | { type: "openPanel"; tab?: "notes" }
  | { type: "currentClips" };

/** From the clipper or the panel: notes, canvases and projects (needs the read permission). */
export type ReadRequest =
  | { type: "items"; q: string }
  | { type: "item"; id: string }
  | { type: "itemImage"; id: string };

/** From the connect script on Octonote's own "Connect extension" page. */
export type ConnectRequest = { type: "exchange"; code: string };

export type Request = PanelRequest | ClipperRequest | ReadRequest | ConnectRequest;

export type Response =
  | {
      ok: true;
      status?: Status;
      collections?: CollectionSummary[];
      collection?: CollectionDetail;
      clipId?: string;
      collectionName?: string;
      url?: string;
      workspaceName?: string;
      items?: ItemSummary[];
      item?: ItemContent;
      /** A PNG as a data: URL. */
      image?: string;
      /** The chosen collection's clips, for inserting into a chat. */
      clips?: CollectionDetail;
      /** Where an insert went. */
      app?: string;
    }
  | {
      ok: false;
      error: string;
      needsConnect?: boolean;
      needsCollection?: boolean;
      /** Reading notes needs the "Insert notes into chats" permission. */
      needsRead?: boolean;
    };

export function send(request: Request): Promise<Response> {
  return chrome.runtime.sendMessage(request) as Promise<Response>;
}

/** From the worker to the panel, so it shows clips the moment they're made. */
export type PanelEvent =
  | { event: "clipped"; collectionId: string; clip: ClipRow }
  | { event: "unclipped"; id: string };

/** From the worker to a chat tab (the "Clip the selected text" shortcut). */
export type TabCommand =
  /** "Are you a chat?" Only the clipper (on ChatGPT, Claude and Gemini) answers, with its app. */
  | { command: "ping" }
  | { command: "clipSelection" }
  | { command: "insertItem"; id: string }
  | { command: "insertClips" };
