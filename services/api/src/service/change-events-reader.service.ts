/**
 * Read-only side of the audit log. The audit writer is the existing
 * ChangeEventsService in common/ which every service depends on for
 * recording — that one stays put. This service is the read-side companion
 * the audit controller talks to.
 */
import { Injectable } from "@nestjs/common";
import type { ChangeEventListQuery } from "../api/v1/request/change-event.request";
import { NotFound } from "../common/error/error-factory";
import { ChangeEventsRepository } from "../db/repository/change-events.repository";
import { toChangeEvent, type ChangeEvent } from "../model/change-event.model";
import { WorkspacesService } from "./workspaces.service";

type RecentKind = "page" | "canvas" | "project" | "notebook";
export interface RecentItem {
  kind: RecentKind;
  id: string;
  lastEditedAt: Date;
}
const RECENT_LIMIT = 200;

@Injectable()
export class ChangeEventsReaderService {
  constructor(
    private readonly eventsRepo: ChangeEventsRepository,
    private readonly workspacesService: WorkspacesService,
  ) {}

  async list(
    workspaceId: string,
    options: ChangeEventListQuery,
    actorUserId: string,
  ): Promise<ChangeEvent[]> {
    await this.workspacesService.requireRole(actorUserId, workspaceId, [
      "OWNER",
      "ADMIN",
      "MEMBER",
    ]);
    const rows = await this.eventsRepo.listByWorkspace(workspaceId, options);
    return rows.map(toChangeEvent);
  }

  /**
   * What the user has been working on, most recent first: their own edits
   * only (from the audit log). Editing a project's note or canvas counts for
   * the project; editing anything inside a notebook counts for the notebook.
   */
  async recentForUser(workspaceId: string, actorUserId: string): Promise<RecentItem[]> {
    await this.workspacesService.requireRole(actorUserId, workspaceId, [
      "OWNER",
      "ADMIN",
      "MEMBER",
    ]);
    const rows = await this.eventsRepo.lastEditsByUser(workspaceId, actorUserId);
    const latest = new Map<string, RecentItem>();
    const bump = (kind: RecentKind, id: string, at: Date) => {
      const key = `${kind}:${id}`;
      const prev = latest.get(key);
      if (!prev || prev.lastEditedAt < at) latest.set(key, { kind, id, lastEditedAt: at });
    };
    for (const r of rows) {
      bump(r.entityType as RecentKind, r.entityId, r.at);
      if (r.projectId) bump("project", r.projectId, r.at);
      if (r.notebookId) bump("notebook", r.notebookId, r.at);
    }
    return [...latest.values()]
      .sort((a, b) => b.lastEditedAt.getTime() - a.lastEditedAt.getTime())
      .slice(0, RECENT_LIMIT);
  }

  async getOne(id: string, actorUserId: string): Promise<ChangeEvent> {
    const row = await this.eventsRepo.findById(id);
    if (!row) throw NotFound("Change event not found.");
    await this.workspacesService.requireRole(actorUserId, row.workspaceId, [
      "OWNER",
      "ADMIN",
      "MEMBER",
    ]);
    return toChangeEvent(row);
  }
}
