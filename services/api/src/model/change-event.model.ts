import type { changeEvents } from "../db/schemas/audit";

export interface ChangeEvent {
  id: string;
  workspaceId: string;
  userId: string | null;
  entityType: string;
  entityId: string;
  action: string;
  before: unknown;
  after: unknown;
  patch: unknown;
  createdAt: Date;
}

export function toChangeEvent(row: typeof changeEvents.$inferSelect): ChangeEvent {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    userId: row.userId,
    entityType: row.entityType,
    entityId: row.entityId,
    action: row.action,
    before: row.before,
    after: row.after,
    patch: row.patch,
    createdAt: row.createdAt,
  };
}
