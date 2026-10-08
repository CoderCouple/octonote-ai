import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Req, UseGuards } from "@nestjs/common";
import { z } from "zod";
import type { OptionalAuthRequest } from "../../../auth/optional-supabase-auth.guard";
import { OptionalSupabaseAuthGuard } from "../../../auth/optional-supabase-auth.guard";
import type { AuthenticatedRequest } from "../../../auth/supabase-auth.guard";
import { SupabaseAuthGuard } from "../../../auth/supabase-auth.guard";
import { ZodValidationPipe } from "../../../common/zod-validation.pipe";
import { NotebooksService } from "../../../service/notebooks.service";
import {
  NotebookCreateSchema,
  NotebookUpdateSchema,
  type NotebookCreate,
  type NotebookUpdate,
} from "../request/notebook.request";
import {
  notebookToDto,
  type NotebookContentsDto,
  type NotebookDto,
} from "../response/notebook.response";
import { projectToDto } from "../response/project.response";

const IdParam = new ZodValidationPipe(z.string().min(1).max(64));

@Controller()
export class NotebooksController {
  constructor(private readonly notebooks: NotebooksService) {}

  @Get("workspaces/:workspaceId/notebooks")
  @UseGuards(SupabaseAuthGuard)
  async list(
    @Param("workspaceId", IdParam) workspaceId: string,
    @Req() req: AuthenticatedRequest,
  ): Promise<NotebookDto[]> {
    const items = await this.notebooks.listForWorkspace(workspaceId, req.user.id);
    return items.map((n) => notebookToDto(n));
  }

  @Post("workspaces/:workspaceId/notebooks")
  @UseGuards(SupabaseAuthGuard)
  async create(
    @Param("workspaceId", IdParam) workspaceId: string,
    @Body(new ZodValidationPipe(NotebookCreateSchema)) body: NotebookCreate,
    @Req() req: AuthenticatedRequest,
  ): Promise<NotebookDto> {
    return notebookToDto(await this.notebooks.create(workspaceId, body, req.user.id), "owner");
  }

  /** Notebook + its notes, canvases and projects. Optional auth for link sharing. */
  @Get("notebooks/:id")
  @UseGuards(OptionalSupabaseAuthGuard)
  async getContents(
    @Param("id", IdParam) id: string,
    @Req() req: OptionalAuthRequest,
  ): Promise<NotebookContentsDto> {
    const c = await this.notebooks.getContents(id, req.user?.id ?? null);
    return {
      notebook: notebookToDto(c.notebook, c.access.role),
      notes: c.notes.map((n) => ({
        ...n,
        createdAt: n.createdAt.toISOString(),
        updatedAt: n.updatedAt.toISOString(),
      })),
      canvases: c.canvases.map((cv) => ({
        ...cv,
        createdAt: cv.createdAt.toISOString(),
        updatedAt: cv.updatedAt.toISOString(),
      })),
      projects: c.projects.map((p) => projectToDto(p)),
    };
  }

  @Patch("notebooks/:id")
  @UseGuards(SupabaseAuthGuard)
  async update(
    @Param("id", IdParam) id: string,
    @Body(new ZodValidationPipe(NotebookUpdateSchema)) body: NotebookUpdate,
    @Req() req: AuthenticatedRequest,
  ): Promise<NotebookDto> {
    return notebookToDto(await this.notebooks.update(id, body, req.user.id));
  }

  /** Contents move back to the top level; nothing inside is deleted. */
  @Delete("notebooks/:id")
  @HttpCode(204)
  @UseGuards(SupabaseAuthGuard)
  async delete(@Param("id", IdParam) id: string, @Req() req: AuthenticatedRequest): Promise<void> {
    await this.notebooks.delete(id, req.user.id);
  }
}
