import type { AccessRole, ResourceKind } from "./types";

export const shareKeys = {
  all: ["shares"] as const,
  people: (kind: ResourceKind, id: string) => [...shareKeys.all, "people", kind, id] as const,
  publish: (kind: ResourceKind, id: string) => [...shareKeys.all, "publish", kind, id] as const,
  sharedWithMe: () => [...shareKeys.all, "shared-with-me"] as const,
};

/** In-app path for a resource. Also the "anyone with the link" URL. */
export const RESOURCE_PATH: Record<ResourceKind, (id: string) => string> = {
  page: (id) => `/n/${id}`,
  canvas: (id) => `/c/${id}`,
  project: (id) => `/p/${id}`,
  notebook: (id) => `/nb/${id}`,
};

export const KIND_LABEL: Record<ResourceKind, string> = {
  page: "note",
  canvas: "canvas",
  project: "project",
  notebook: "notebook",
};

const RANK: Record<AccessRole, number> = { viewer: 1, editor: 2, owner: 3 };

/** Mirrors the API: editors can share; only owners change general access or publish. */
export const can = {
  share: (role: AccessRole) => RANK[role] >= RANK.editor,
  manage: (role: AccessRole) => role === "owner",
  edit: (role: AccessRole) => RANK[role] >= RANK.editor,
};
