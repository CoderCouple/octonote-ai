/**
 * "People with access" — per-person grants, Google Docs style.
 *
 * Sharing with an email that already has an account creates an active
 * grant; otherwise a pending grant that MeService activates when that
 * email signs up. Re-sharing with someone who already has access updates
 * their role instead of duplicating the grant.
 */
import { Injectable, Logger } from "@nestjs/common";
import type { ShareCreate } from "../api/v1/request/sharing.request";
import { ChangeEventsService } from "../common/change-events.service";
import { EmailService } from "../common/email.service";
import { BadRequest, NotFound } from "../common/error/error-factory";
import { PermissionsService } from "../common/permissions.service";
import { SharingRepository } from "../db/repository/sharing.repository";
import {
  toResourceShare,
  type ResourceKind,
  type ResourceShare,
  type ShareRole,
} from "../model/sharing.model";
import { toUser, type User } from "../model/user.model";
import { resourceUrl } from "./lib/resource-url";

export interface ShareWithUser {
  share: ResourceShare;
  user: User | null;
}

export interface SharedWithMeItem {
  kind: ResourceKind;
  id: string;
  title: string;
  role: ShareRole;
  sharedByUserId: string;
  sharedAt: Date;
}

@Injectable()
export class SharesService {
  private readonly logger = new Logger(SharesService.name);

  constructor(
    private readonly sharingRepo: SharingRepository,
    private readonly permissions: PermissionsService,
    private readonly email: EmailService,
    private readonly changeEvents: ChangeEventsService,
  ) {}

  async list(kind: ResourceKind, id: string, actorUserId: string): Promise<ShareWithUser[]> {
    await this.permissions.require(actorUserId, { kind, id }, "share");
    const rows = await this.sharingRepo.listForResource(kind, id);
    return rows.map((r) => ({
      share: toResourceShare(r.share),
      user: r.user ? toUser(r.user) : null,
    }));
  }

  async add(
    input: ShareCreate,
    actor: { id: string; email?: string; name?: string },
  ): Promise<ShareWithUser & { emailSent: boolean }> {
    // Pending invites are matched on lowercase email at sign-up (MeService); normalise here too.
    input = { ...input, email: input.email.trim().toLowerCase() };
    const kind = input.resourceKind;
    const access = await this.permissions.require(actor.id, { kind, id: input.resourceId }, "share");
    if (actor.email && input.email === actor.email.toLowerCase()) {
      throw BadRequest("You already have access.");
    }
    const resource = await this.sharingRepo.findResource(kind, input.resourceId);
    if (!resource) throw NotFound("Resource not found.");

    const grantee = await this.sharingRepo.findUserByEmail(input.email);
    const existing = await this.sharingRepo.findLiveGrant(
      kind,
      input.resourceId,
      grantee?.id ?? null,
      input.email,
    );

    const row = existing
      ? await this.sharingRepo.updateById(existing.id, { role: input.role, updatedAt: new Date() })
      : await this.sharingRepo.insert({
          workspaceId: access.workspaceId,
          resourceKind: kind,
          resourceId: input.resourceId,
          grantedToUserId: grantee?.id ?? null,
          grantedToEmail: grantee ? null : input.email,
          role: input.role,
          status: grantee ? "active" : "pending",
          grantedByUserId: actor.id,
          acceptedAt: grantee ? new Date() : null,
        });
    if (!row) throw NotFound("Share not found.");

    await this.changeEvents.record({
      workspaceId: access.workspaceId,
      userId: actor.id,
      entityType: "resource_share",
      entityId: row.id,
      action: existing ? "share.update" : grantee ? "share.grant" : "share.invite",
      after: { kind, resourceId: input.resourceId, role: input.role, email: input.email },
    });

    let emailSent = false;
    if (!existing) {
      try {
        await this.email.sendShareNotification({
          to: input.email,
          inviterName: actor.name ?? actor.email ?? "Someone",
          resourceKind: kind,
          resourceTitle: resource.title,
          url: resourceUrl(kind, input.resourceId),
          role: input.role,
          needsAccount: !grantee,
        });
        emailSent = true;
      } catch (err) {
        // The grant stands; the client shows "couldn't send email" and can retry.
        this.logger.error(`Share email to ${input.email} failed`, err as Error);
      }
    }

    return { share: toResourceShare(row), user: grantee ? toUser(grantee) : null, emailSent };
  }

  async updateRole(shareId: string, role: ShareRole, actorUserId: string): Promise<ResourceShare> {
    const existing = await this.sharingRepo.findById(shareId);
    if (!existing || existing.status === "revoked") throw NotFound("Share not found.");
    const access = await this.permissions.require(
      actorUserId,
      { kind: existing.resourceKind, id: existing.resourceId },
      "share",
    );
    const updated = await this.sharingRepo.updateById(shareId, { role, updatedAt: new Date() });
    if (!updated) throw NotFound("Share not found.");
    await this.changeEvents.record({
      workspaceId: access.workspaceId,
      userId: actorUserId,
      entityType: "resource_share",
      entityId: shareId,
      action: "share.update",
      before: { role: existing.role },
      after: { role },
    });
    return toResourceShare(updated);
  }

  async revoke(shareId: string, actorUserId: string): Promise<void> {
    const existing = await this.sharingRepo.findById(shareId);
    if (!existing || existing.status === "revoked") throw NotFound("Share not found.");
    const access = await this.permissions.require(
      actorUserId,
      { kind: existing.resourceKind, id: existing.resourceId },
      "share",
    );
    await this.sharingRepo.updateById(shareId, {
      status: "revoked",
      revokedAt: new Date(),
      updatedAt: new Date(),
    });
    await this.changeEvents.record({
      workspaceId: access.workspaceId,
      userId: actorUserId,
      entityType: "resource_share",
      entityId: shareId,
      action: "share.revoke",
      before: { role: existing.role, userId: existing.grantedToUserId, email: existing.grantedToEmail },
    });
  }

  /** Items shared directly with the user; deleted or archived resources drop out. */
  async sharedWithMe(userId: string): Promise<SharedWithMeItem[]> {
    const grants = await this.sharingRepo.listActiveForUser(userId);
    const resources = await this.sharingRepo.findResources(
      grants.map((g) => ({ kind: g.resourceKind, id: g.resourceId })),
    );
    const byKey = new Map(resources.map((r) => [`${r.kind}:${r.id}`, r]));
    return grants.flatMap((g) => {
      const r = byKey.get(`${g.resourceKind}:${g.resourceId}`);
      if (!r) return [];
      return [
        {
          kind: g.resourceKind,
          id: g.resourceId,
          title: r.title,
          role: g.role,
          sharedByUserId: g.grantedByUserId,
          sharedAt: g.updatedAt,
        },
      ];
    });
  }
}
