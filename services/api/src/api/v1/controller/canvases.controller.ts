import { Body, Controller, Delete, Get, Param, Patch, Post, Req, UseGuards } from "@nestjs/common";
import { z } from "zod";
import type { OptionalAuthRequest } from "../../../auth/optional-supabase-auth.guard";
import { OptionalSupabaseAuthGuard } from "../../../auth/optional-supabase-auth.guard";
import type { AuthenticatedRequest } from "../../../auth/supabase-auth.guard";
import { SupabaseAuthGuard } from "../../../auth/supabase-auth.guard";
import { ZodValidationPipe } from "../../../common/zod-validation.pipe";
import type { CanvasSummaryRow } from "../../../db/repository/canvases.repository";
import { CanvasesService } from "../../../service/canvases.service";
import {
  CanvasCreateSchema,
  CanvasUpdateSchema,
  type CanvasCreate,
  type CanvasUpdate,
} from "../request/canvas.request";
import { MoveToNotebookSchema, type MoveToNotebook } from "../request/notebook.request";
import { canvasToDto, type CanvasDto, type CanvasSummaryDto } from "../response/canvas.response";

const IdParam = new ZodValidationPipe(z.string().min(1).max(64));

function summaryToDto(r: CanvasSummaryRow): CanvasSummaryDto {
  return { ...r, createdAt: r.createdAt.toISOString(), updatedAt: r.updatedAt.toISOString() };
}

@Controller()
export class CanvasesController {
  constructor(private readonly canvases: CanvasesService) {}

  /** Standalone canvases (not owned by a project), each with its notebookId. */
  @Get("workspaces/:workspaceId/canvases")
  @UseGuards(SupabaseAuthGuard)
  async list(
    @Param("workspaceId", IdParam) workspaceId: string,
    @Req() req: AuthenticatedRequest,
  ): Promise<CanvasSummaryDto[]> {
    return (await this.canvases.listStandalone(workspaceId, req.user.id)).map(summaryToDto);
  }

  /** Every canvas incl. project-owned ones, for the notes `/canvas` picker. */
  @Get("workspaces/:workspaceId/canvases/pickable")
  @UseGuards(SupabaseAuthGuard)
  async listPickable(
    @Param("workspaceId", IdParam) workspaceId: string,
    @Req() req: AuthenticatedRequest,
  ): Promise<CanvasSummaryDto[]> {
    return (await this.canvases.listPickable(workspaceId, req.user.id)).map(summaryToDto);
  }

  @Post("workspaces/:workspaceId/canvases")
  @UseGuards(SupabaseAuthGuard)
  async create(
    @Param("workspaceId", IdParam) workspaceId: string,
    @Body(new ZodValidationPipe(CanvasCreateSchema)) body: CanvasCreate,
    @Req() req: AuthenticatedRequest,
  ): Promise<CanvasDto> {
    return canvasToDto(await this.canvases.create(workspaceId, body, req.user.id), "owner");
  }

  /** Optional auth: "anyone with the link" works for signed-out visitors. */
  @Get("canvases/:id")
  @UseGuards(OptionalSupabaseAuthGuard)
  async getOne(
    @Param("id", IdParam) id: string,
    @Req() req: OptionalAuthRequest,
  ): Promise<CanvasDto> {
    const { canvas, access } = await this.canvases.getOne(id, req.user?.id ?? null);
    return canvasToDto(canvas, access.role);
  }

  /** Title + thumbnail only, for the notes `canvasReference` block. */
  @Get("canvases/:id/summary")
  @UseGuards(OptionalSupabaseAuthGuard)
  async getSummary(
    @Param("id", IdParam) id: string,
    @Req() req: OptionalAuthRequest,
  ): Promise<{ id: string; title: string; thumbnailUrl: string | null; projectId: string | null }> {
    const { canvas } = await this.canvases.getOne(id, req.user?.id ?? null);
    return {
      id: canvas.id,
      title: canvas.title,
      thumbnailUrl: canvas.thumbnailUrl,
      projectId: canvas.projectId,
    };
  }

  @Patch("canvases/:id")
  @UseGuards(SupabaseAuthGuard)
  async update(
    @Param("id", IdParam) id: string,
    @Body(new ZodValidationPipe(CanvasUpdateSchema)) body: CanvasUpdate,
    @Req() req: AuthenticatedRequest,
  ): Promise<CanvasDto> {
    return canvasToDto(await this.canvases.update(id, body, req.user.id));
  }

  @Post("canvases/:id/move")
  @UseGuards(SupabaseAuthGuard)
  async move(
    @Param("id", IdParam) id: string,
    @Body(new ZodValidationPipe(MoveToNotebookSchema)) body: MoveToNotebook,
    @Req() req: AuthenticatedRequest,
  ): Promise<CanvasDto> {
    return canvasToDto(await this.canvases.moveToNotebook(id, body.notebookId, req.user.id));
  }

  @Delete("canvases/:id")
  @UseGuards(SupabaseAuthGuard)
  async softDelete(
    @Param("id", IdParam) id: string,
    @Req() req: AuthenticatedRequest,
  ): Promise<CanvasDto> {
    return canvasToDto(await this.canvases.softDelete(id, req.user.id));
  }
}
