import { pgEnum } from "drizzle-orm/pg-core";

export const workspaceRole = pgEnum("workspace_role", ["OWNER", "ADMIN", "MEMBER"]);

export const resourceKind = pgEnum("resource_kind", ["page", "canvas", "project", "notebook"]);

export const shareRole = pgEnum("share_role", ["viewer", "editor"]);

export const shareStatus = pgEnum("share_status", ["active", "pending", "revoked"]);

export const linkAccess = pgEnum("link_access", ["restricted", "anyone_with_link"]);
