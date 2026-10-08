import { Body, Controller, Delete, Get, Param, Patch, Post, Req, UseGuards } from "@nestjs/common";
import { z } from "zod";
import type { OptionalAuthRequest } from "../../../auth/optional-supabase-auth.guard";
import { OptionalSupabaseAuthGuard } from "../../../auth/optional-supabase-auth.guard";
import type { AuthenticatedRequest } from "../../../auth/supabase-auth.guard";
import { SupabaseAuthGuard } from "../../../auth/supabase-auth.guard";
import { ZodValidationPipe } from "../../../common/zod-validation.pipe";
import { PagesService } from "../../../service/pages.service";
import { MoveToNotebookSchema, type MoveToNotebook } from "../request/notebook.request";
import {
  PageCreateSchema,
  PageUpdateSchema,
  type PageCreate,
  type PageUpdate,
} from "../request/page.request";
import { pageToDto, type PageDto, type PageSummaryDto } from "../response/page.response";

const IdParam = new ZodValidationPipe(z.string().min(1).max(64));

@Controller()
export class PagesController {
  constructor(private readonly pages: PagesService) {}

  /** Standalone notes (not owned by a project), each with its notebookId. */
  @Get("workspaces/:workspaceId/pages")
  @UseGuards(SupabaseAuthGuard)
  async list(
    @Param("workspaceId", IdParam) workspaceId: string,
    @Req() req: AuthenticatedRequest,
  ): Promise<PageSummaryDto[]> {
    const rows = await this.pages.listStandalone(workspaceId, req.user.id);
    return rows.map((r) => ({
      ...r,
      updatedAt: r.updatedAt.toISOString(),
      createdAt: r.createdAt.toISOString(),
    }));
  }

  @Post("workspaces/:workspaceId/pages")
  @UseGuards(SupabaseAuthGuard)
  async create(
    @Param("workspaceId", IdParam) workspaceId: string,
    @Body(new ZodValidationPipe(PageCreateSchema)) body: PageCreate,
    @Req() req: AuthenticatedRequest,
  ): Promise<PageDto> {
    return pageToDto(await this.pages.create(workspaceId, body, req.user.id), "owner");
  }

  /** Optional auth: "anyone with the link" works for signed-out visitors. */
  @Get("pages/:id")
  @UseGuards(OptionalSupabaseAuthGuard)
  async getOne(
    @Param("id", IdParam) id: string,
    @Req() req: OptionalAuthRequest,
  ): Promise<PageDto> {
    const { page, access } = await this.pages.getOne(id, req.user?.id ?? null);
    return pageToDto(page, access.role);
  }

  @Patch("pages/:id")
  @UseGuards(SupabaseAuthGuard)
  async update(
    @Param("id", IdParam) id: string,
    @Body(new ZodValidationPipe(PageUpdateSchema)) body: PageUpdate,
    @Req() req: AuthenticatedRequest,
  ): Promise<PageDto> {
    return pageToDto(await this.pages.update(id, body, req.user.id));
  }

  @Post("pages/:id/move")
  @UseGuards(SupabaseAuthGuard)
  async move(
    @Param("id", IdParam) id: string,
    @Body(new ZodValidationPipe(MoveToNotebookSchema)) body: MoveToNotebook,
    @Req() req: AuthenticatedRequest,
  ): Promise<PageDto> {
    return pageToDto(await this.pages.moveToNotebook(id, body.notebookId, req.user.id));
  }

  @Delete("pages/:id")
  @UseGuards(SupabaseAuthGuard)
  async softDelete(
    @Param("id", IdParam) id: string,
    @Req() req: AuthenticatedRequest,
  ): Promise<PageDto> {
    return pageToDto(await this.pages.softDelete(id, req.user.id));
  }
}
