import type {
  Workspace,
  WorkspaceCreate,
  WorkspaceMember,
  WorkspaceUpdate,
} from "@octonote/shared";

export type { Workspace, WorkspaceCreate, WorkspaceMember, WorkspaceUpdate };

export type Role = "OWNER" | "ADMIN" | "MEMBER";

export interface MeUser {
  id: string;
  name: string;
  email: string;
  avatarUrl: string | null;
}

export interface MembershipSummary {
  membership: { id: string; role: Role; workspaceId: string };
  workspace: { id: string; name: string; slug: string };
}

export interface MeResponse {
  user: MeUser;
  memberships: MembershipSummary[];
}

/**
 * Settings page consumes a denormalised member-row shape with the user's
 * profile inlined for the table. Keep this in sync with the api response.
 */
export interface MemberRow {
  id: string;
  userId: string;
  role: Role;
  createdAt: string;
  user: MeUser;
}
