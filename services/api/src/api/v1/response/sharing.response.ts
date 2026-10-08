import type { Role } from "../../../common/permissions.service";
import type {
  LinkAccess,
  ResourceKind,
  ResourceShare,
  ShareRole,
  ShareStatus,
  SharingState,
} from "../../../model/sharing.model";
import type { User } from "../../../model/user.model";

export interface SharingDto {
  linkAccess: LinkAccess;
  linkRole: ShareRole;
  publicSlug: string | null;
  publishedAt: string | null;
  myRole?: Role;
}

export function sharingToDto(s: SharingState, myRole?: Role): SharingDto {
  return {
    linkAccess: s.linkAccess,
    linkRole: s.linkRole,
    publicSlug: s.publicSlug,
    publishedAt: s.publishedAt ? s.publishedAt.toISOString() : null,
    ...(myRole ? { myRole } : {}),
  };
}

export interface ShareDto {
  id: string;
  resourceKind: ResourceKind;
  resourceId: string;
  role: ShareRole;
  status: ShareStatus;
  user: { id: string; name: string; email: string; avatarUrl: string | null } | null;
  pendingEmail: string | null;
  createdAt: string;
}

export function shareToDto(share: ResourceShare, user: User | null): ShareDto {
  return {
    id: share.id,
    resourceKind: share.resourceKind,
    resourceId: share.resourceId,
    role: share.role,
    status: share.status,
    user: user
      ? { id: user.id, name: user.name, email: user.email, avatarUrl: user.avatarUrl }
      : null,
    pendingEmail: share.status === "pending" ? share.grantedToEmail : null,
    createdAt: share.createdAt.toISOString(),
  };
}

export interface PublishStateDto {
  resourceKind: ResourceKind;
  resourceId: string;
  published: boolean;
  publicSlug: string | null;
  publicUrl: string | null;
  publishedVia: { kind: ResourceKind; id: string; name: string } | null;
}
