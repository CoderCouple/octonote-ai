import type { resourceShares } from "../db/schemas/sharing";

export type ResourceKind = "page" | "canvas" | "project" | "notebook";
export type ShareRole = "viewer" | "editor";
export type LinkAccess = "restricted" | "anyone_with_link";
export type ShareStatus = "active" | "pending" | "revoked";

/** General access + publish state carried by every shareable resource. */
export interface SharingState {
  linkAccess: LinkAccess;
  linkRole: ShareRole;
  publicSlug: string | null;
  publishedAt: Date | null;
}

export function pickSharing(row: SharingState): SharingState {
  return {
    linkAccess: row.linkAccess,
    linkRole: row.linkRole,
    publicSlug: row.publicSlug,
    publishedAt: row.publishedAt,
  };
}

export interface ResourceShare {
  id: string;
  workspaceId: string;
  resourceKind: ResourceKind;
  resourceId: string;
  grantedToUserId: string | null;
  grantedToEmail: string | null;
  role: ShareRole;
  status: ShareStatus;
  grantedByUserId: string;
  createdAt: Date;
  updatedAt: Date;
  acceptedAt: Date | null;
  revokedAt: Date | null;
}

export function toResourceShare(row: typeof resourceShares.$inferSelect): ResourceShare {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    resourceKind: row.resourceKind,
    resourceId: row.resourceId,
    grantedToUserId: row.grantedToUserId,
    grantedToEmail: row.grantedToEmail,
    role: row.role,
    status: row.status,
    grantedByUserId: row.grantedByUserId,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    acceptedAt: row.acceptedAt,
    revokedAt: row.revokedAt,
  };
}
