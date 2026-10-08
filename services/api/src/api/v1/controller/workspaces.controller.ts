/**
 * HTTP adapter for workspace CRUD. All business logic lives in
 * WorkspacesService; this file does request → service call → DTO mapping.
 */
import {
  Body,
  Controller,
  Delete,
  HttpCode,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from "@nestjs/common";
import { z } from "zod";
import type { AuthenticatedRequest } from "../../../auth/supabase-auth.guard";
import { SupabaseAuthGuard } from "../../../auth/supabase-auth.guard";
import { ZodValidationPipe } from "../../../common/zod-validation.pipe";
import { WorkspacesService } from "../../../service/workspaces.service";
import {
  WorkspaceCreateSchema,
  WorkspaceUpdateSchema,
  type WorkspaceCreate,
  type WorkspaceUpdate,
} from "../request/workspace.request";
import { workspaceToDto, type WorkspaceDto } from "../response/workspace.response";

const IdParam = new ZodValidationPipe(z.string().min(1).max(64));

@Controller("workspaces")
@UseGuards(SupabaseAuthGuard)
export class WorkspacesController {
  constructor(private readonly workspaces: WorkspacesService) {}

  @Post()
  async create(
    @Body(new ZodValidationPipe(WorkspaceCreateSchema)) body: WorkspaceCreate,
    @Req() req: AuthenticatedRequest,
  ): Promise<WorkspaceDto> {
    const { workspace } = await this.workspaces.create(body, req.user.id);
    return workspaceToDto(workspace);
  }

  @Patch(":id")
  async update(
    @Param("id", IdParam) id: string,
    @Body(new ZodValidationPipe(WorkspaceUpdateSchema)) body: WorkspaceUpdate,
    @Req() req: AuthenticatedRequest,
  ): Promise<WorkspaceDto> {
    const workspace = await this.workspaces.update(id, body, req.user.id);
    return workspaceToDto(workspace);
  }

  @Delete(":id")
  @HttpCode(200)
  async remove(@Param("id", IdParam) id: string, @Req() req: AuthenticatedRequest) {
    await this.workspaces.remove(id, req.user.id);
    return { ok: true };
  }
}
