import { Body, Controller, Delete, Get, Param, Patch, Post, Req, UseGuards } from "@nestjs/common";
import { z } from "zod";
import type { OptionalAuthRequest } from "../../../auth/optional-supabase-auth.guard";
import { OptionalSupabaseAuthGuard } from "../../../auth/optional-supabase-auth.guard";
import type { AuthenticatedRequest } from "../../../auth/supabase-auth.guard";
import { SupabaseAuthGuard } from "../../../auth/supabase-auth.guard";
import { ZodValidationPipe } from "../../../common/zod-validation.pipe";
import { ProjectsService } from "../../../service/projects.service";
import { MoveToNotebookSchema, type MoveToNotebook } from "../request/notebook.request";
import {
  ProjectCreateSchema,
  ProjectUpdateSchema,
  type ProjectCreate,
  type ProjectUpdate,
} from "../request/project.request";
import { projectToDto, type ProjectDto } from "../response/project.response";

const IdParam = new ZodValidationPipe(z.string().min(1).max(64));

/** A project plus the ids of the note + canvas it owns. */
export interface ProjectWithPairDto extends ProjectDto {
  noteId: string | null;
  canvasId: string | null;
}

@Controller()
export class ProjectsController {
  constructor(private readonly projects: ProjectsService) {}

  @Get("workspaces/:workspaceId/projects")
  @UseGuards(SupabaseAuthGuard)
  async list(
    @Param("workspaceId", IdParam) workspaceId: string,
    @Req() req: AuthenticatedRequest,
  ): Promise<ProjectDto[]> {
    const items = await this.projects.listForWorkspace(workspaceId, req.user.id);
    return items.map((p) => projectToDto(p));
  }

  @Post("workspaces/:workspaceId/projects")
  @UseGuards(SupabaseAuthGuard)
  async create(
    @Param("workspaceId", IdParam) workspaceId: string,
    @Body(new ZodValidationPipe(ProjectCreateSchema)) body: ProjectCreate,
    @Req() req: AuthenticatedRequest,
  ): Promise<ProjectWithPairDto> {
    const { project, noteId, canvasId } = await this.projects.create(
      workspaceId,
      body,
      req.user.id,
    );
    return { ...projectToDto(project, "owner"), noteId, canvasId };
  }

  /** Optional auth: "anyone with the link" works for signed-out visitors. */
  @Get("projects/:id")
  @UseGuards(OptionalSupabaseAuthGuard)
  async getOne(
    @Param("id", IdParam) id: string,
    @Req() req: OptionalAuthRequest,
  ): Promise<ProjectWithPairDto> {
    const { project, noteId, canvasId, access } = await this.projects.getOne(
      id,
      req.user?.id ?? null,
    );
    return { ...projectToDto(project, access.role), noteId, canvasId };
  }

  @Patch("projects/:id")
  @UseGuards(SupabaseAuthGuard)
  async update(
    @Param("id", IdParam) id: string,
    @Body(new ZodValidationPipe(ProjectUpdateSchema)) body: ProjectUpdate,
    @Req() req: AuthenticatedRequest,
  ): Promise<ProjectDto> {
    return projectToDto(await this.projects.update(id, body, req.user.id));
  }

  @Post("projects/:id/move")
  @UseGuards(SupabaseAuthGuard)
  async move(
    @Param("id", IdParam) id: string,
    @Body(new ZodValidationPipe(MoveToNotebookSchema)) body: MoveToNotebook,
    @Req() req: AuthenticatedRequest,
  ): Promise<ProjectDto> {
    return projectToDto(await this.projects.moveToNotebook(id, body.notebookId, req.user.id));
  }

  @Delete("projects/:id")
  @UseGuards(SupabaseAuthGuard)
  async archive(
    @Param("id", IdParam) id: string,
    @Req() req: AuthenticatedRequest,
  ): Promise<ProjectDto> {
    return projectToDto(await this.projects.archive(id, req.user.id));
  }
}
