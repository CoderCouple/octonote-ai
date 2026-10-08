/**
 * "General access" (restricted / anyone with the link) and "Publish to web"
 * for notes, canvases, projects and notebooks. Owner-only ("manage").
 *
 * Published state is inherited at read time: a resource is public if it or
 * any ancestor is published. getPublishState reports which ancestor so the
 * editor can show "Published via <notebook>".
 */
import { Injectable } from "@nestjs/common";
import type { GeneralAccessUpdate } from "../api/v1/request/sharing.request";
import type { PublishStateDto } from "../api/v1/response/sharing.response";
import { ChangeEventsService } from "../common/change-events.service";
import { NotFound, ServerError } from "../common/error/error-factory";
import { PermissionsService } from "../common/permissions.service";
import { slugifyTitle, withSuffix } from "../common/slug";
import { SharingRepository, type ShareableRow } from "../db/repository/sharing.repository";
import type { ResourceKind } from "../model/sharing.model";
import { publicUrl } from "./lib/resource-url";

const SLUG_ATTEMPTS = 5;

@Injectable()
export class SharingSettingsService {
  constructor(
    private readonly sharingRepo: SharingRepository,
    private readonly permissions: PermissionsService,
    private readonly changeEvents: ChangeEventsService,
  ) {}

  async setGeneralAccess(
    kind: ResourceKind,
    id: string,
    input: GeneralAccessUpdate,
    actorUserId: string,
  ): Promise<void> {
    const access = await this.permissions.require(actorUserId, { kind, id }, "manage");
    await this.sharingRepo.updateSharing(kind, id, {
      linkAccess: input.linkAccess,
      linkRole: input.linkRole,
    });
    await this.changeEvents.record({
      workspaceId: access.workspaceId,
      userId: actorUserId,
      entityType: kind,
      entityId: id,
      action: `${kind}.general_access`,
      after: input,
    });
  }

  async setPublished(
    kind: ResourceKind,
    id: string,
    published: boolean,
    actorUserId: string,
  ): Promise<PublishStateDto> {
    const access = await this.permissions.require(actorUserId, { kind, id }, "manage");
    const resource = await this.sharingRepo.findResource(kind, id);
    if (!resource) throw NotFound("Resource not found.");

    // Slugs are sticky: unpublish + republish keeps old links working.
    const publicSlug = resource.publicSlug ?? (await this.allocateSlug(resource.title));
    await this.sharingRepo.updateSharing(kind, id, {
      publicSlug,
      publishedAt: published ? (resource.publishedAt ?? new Date()) : null,
    });
    await this.changeEvents.record({
      workspaceId: access.workspaceId,
      userId: actorUserId,
      entityType: kind,
      entityId: id,
      action: published ? `${kind}.publish` : `${kind}.unpublish`,
      after: { publicSlug },
    });
    return this.getPublishState(kind, id, actorUserId);
  }

  async getPublishState(
    kind: ResourceKind,
    id: string,
    actorUserId: string,
  ): Promise<PublishStateDto> {
    await this.permissions.require(actorUserId, { kind, id }, "view");
    const resource = await this.sharingRepo.findResource(kind, id);
    if (!resource) throw NotFound("Resource not found.");

    if (resource.publishedAt && resource.publicSlug) {
      return {
        resourceKind: kind,
        resourceId: id,
        published: true,
        publicSlug: resource.publicSlug,
        publicUrl: publicUrl(resource.publicSlug),
        publishedVia: null,
      };
    }
    const via = await this.publishedAncestor(resource);
    return {
      resourceKind: kind,
      resourceId: id,
      published: via !== null,
      publicSlug: resource.publicSlug,
      publicUrl: via?.publicSlug ? publicUrl(via.publicSlug) : null,
      publishedVia: via ? { kind: via.kind, id: via.id, name: via.title } : null,
    };
  }

  private async publishedAncestor(resource: ShareableRow): Promise<ShareableRow | null> {
    let parent = resource.parent;
    while (parent) {
      const row = await this.sharingRepo.findResource(parent.kind, parent.id);
      if (!row) return null;
      if (row.publishedAt && row.publicSlug) return row;
      parent = row.parent;
    }
    return null;
  }

  /** Slugs are unique across all four tables (one /pub/<slug> namespace). */
  private async allocateSlug(title: string): Promise<string> {
    const base = slugifyTitle(title);
    for (let i = 0; i < SLUG_ATTEMPTS; i++) {
      const candidate = withSuffix(base);
      if (!(await this.sharingRepo.findByPublicSlug(candidate))) return candidate;
    }
    throw ServerError("Could not allocate a public URL; please retry.");
  }
}
