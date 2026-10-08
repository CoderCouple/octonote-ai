import type {
  AccessRole,
  LinkAccess,
  PublishState,
  ResourceKind,
  Share,
  ShareRole,
} from "@octonote/shared";

export type { AccessRole, LinkAccess, PublishState, ResourceKind, Share, ShareRole };

export interface SharedWithMeItem {
  kind: ResourceKind;
  id: string;
  title: string;
  role: ShareRole;
  sharedByUserId: string;
  sharedAt: string;
}

/** Sharing state the editors already have from their resource fetch. */
export interface SharingSnapshot {
  linkAccess: LinkAccess;
  linkRole: ShareRole;
  myRole: AccessRole;
}
