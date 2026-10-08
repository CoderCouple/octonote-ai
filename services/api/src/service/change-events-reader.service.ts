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
