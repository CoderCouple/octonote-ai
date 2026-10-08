/**
 * Wire shapes returned by the workspaces feature. Dates serialize to ISO
 * strings; null is preserved.
 *
 * These DTOs are the controller's responsibility — services return domain
 * model objects from src/model/, controllers map them here.
 */
import type { Workspace, WorkspaceMember, WorkspaceRole } from "../../../model/workspace.model";

export interface WorkspaceDto {
  id: string;
  name: string;
  slug: string;
  createdAt: string;
  updatedAt: string;
}

export interface WorkspaceMemberDto {
  id: string;
  workspaceId: string;
  userId: string;
  role: WorkspaceRole;
  createdAt: string;
  user?: {
    id: string;
    name: string;
    email: string;
    avatarUrl: string | null;
  };
}

export function workspaceToDto(workspace: Workspace): WorkspaceDto {
  return {
    id: workspace.id,
    name: workspace.name,
    slug: workspace.slug,
    createdAt: workspace.createdAt.toISOString(),
    updatedAt: workspace.updatedAt.toISOString(),
  };
}

export function memberToDto(
  member: WorkspaceMember,
  user?: { id: string; name: string; email: string; avatarUrl: string | null },
): WorkspaceMemberDto {
  return {
    id: member.id,
    workspaceId: member.workspaceId,
    userId: member.userId,
    role: member.role,
    createdAt: member.createdAt.toISOString(),
    ...(user ? { user } : {}),
  };
}
