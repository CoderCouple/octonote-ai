import type { User } from "../../../model/user.model";
import type { Workspace, WorkspaceMember } from "../../../model/workspace.model";

export interface UserDto {
  id: string;
  name: string;
  email: string;
  avatarUrl: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface MembershipPairDto {
  membership: {
    id: string;
    workspaceId: string;
    userId: string;
    role: WorkspaceMember["role"];
    createdAt: string;
  };
  workspace: {
    id: string;
    name: string;
    slug: string;
    createdAt: string;
    updatedAt: string;
  };
}

export interface MeDto {
  user: UserDto;
  memberships: MembershipPairDto[];
}

export function userToDto(user: User): UserDto {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    avatarUrl: user.avatarUrl,
    createdAt: user.createdAt.toISOString(),
    updatedAt: user.updatedAt.toISOString(),
  };
}

export function membershipPairToDto(
  membership: WorkspaceMember,
  workspace: Workspace,
): MembershipPairDto {
  return {
    membership: {
      id: membership.id,
      workspaceId: membership.workspaceId,
      userId: membership.userId,
      role: membership.role,
      createdAt: membership.createdAt.toISOString(),
    },
    workspace: {
      id: workspace.id,
      name: workspace.name,
      slug: workspace.slug,
      createdAt: workspace.createdAt.toISOString(),
      updatedAt: workspace.updatedAt.toISOString(),
    },
  };
}
