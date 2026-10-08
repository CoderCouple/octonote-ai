import type { ChangeEvent } from "../../../model/change-event.model";

export interface ChangeEventDto {
  id: string;
  workspaceId: string;
  userId: string | null;
  entityType: string;
  entityId: string;
  action: string;
  before: unknown;
  after: unknown;
  patch: unknown;
  createdAt: string;
}

export function changeEventToDto(event: ChangeEvent): ChangeEventDto {
  return {
    id: event.id,
    workspaceId: event.workspaceId,
    userId: event.userId,
    entityType: event.entityType,
    entityId: event.entityId,
    action: event.action,
    before: event.before,
    after: event.after,
    patch: event.patch,
    createdAt: event.createdAt.toISOString(),
  };
}
