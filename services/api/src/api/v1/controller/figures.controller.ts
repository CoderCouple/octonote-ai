import { Body, Controller, Delete, Get, Param, Post, Put, Req, Res, UseGuards } from "@nestjs/common";
import type { FastifyReply } from "fastify";
import { z } from "zod";
import type { OptionalAuthRequest } from "../../../auth/optional-supabase-auth.guard";
import { OptionalSupabaseAuthGuard } from "../../../auth/optional-supabase-auth.guard";
import type { AuthenticatedRequest } from "../../../auth/supabase-auth.guard";
import { SupabaseAuthGuard } from "../../../auth/supabase-auth.guard";
import { ZodValidationPipe } from "../../../common/zod-validation.pipe";
import { FiguresService, type FigureDto, type FigureView } from "../../../service/figures.service";

const IdParam = new ZodValidationPipe(z.string().min(1).max(64));
const FigureInputSchema = z.object({
  title: z.string().max(200),
  width: z.number().nonnegative().max(100_000),
  height: z.number().nonnegative().max(100_000),
  contentHash: z.string().min(1).max(128),
  png: z.string().max(7_000_000).optional(),
});

@Controller()
export class FiguresController {
  constructor(private readonly figures: FiguresService) {}

  /** Create or update a figure (and optionally its PNG). Editors of the canvas only. */
  @Put("canvases/:canvasId/figures/:figureId")
  @UseGuards(SupabaseAuthGuard)
  upsert(
    @Param("canvasId", IdParam) canvasId: string,
    @Param("figureId", IdParam) figureId: string,
    @Body(new ZodValidationPipe(FigureInputSchema)) body: z.infer<typeof FigureInputSchema>,
    @Req() req: AuthenticatedRequest,
  ): Promise<FigureDto> {
    return this.figures.upsert(canvasId, figureId, body, req.user.id);
  }

  @Delete("canvases/:canvasId/figures/:figureId")
  @UseGuards(SupabaseAuthGuard)
  async remove(
    @Param("canvasId", IdParam) canvasId: string,
    @Param("figureId", IdParam) figureId: string,
    @Req() req: AuthenticatedRequest,
  ): Promise<{ deleted: true }> {
    await this.figures.remove(canvasId, figureId, req.user.id);
    return { deleted: true };
  }

  @Get("canvases/:canvasId/figures")
  @UseGuards(OptionalSupabaseAuthGuard)
  listForCanvas(
    @Param("canvasId", IdParam) canvasId: string,
    @Req() req: OptionalAuthRequest,
  ): Promise<FigureDto[]> {
    return this.figures.listForCanvas(canvasId, req.user?.id ?? null);
  }

  /** The notes "/figure" picker. */
  @Get("workspaces/:workspaceId/figures")
  @UseGuards(SupabaseAuthGuard)
  listForWorkspace(
    @Param("workspaceId", IdParam) workspaceId: string,
    @Req() req: AuthenticatedRequest,
  ): Promise<FigureDto[]> {
    return this.figures.listForWorkspace(workspaceId, req.user.id);
  }

  /** The picture. Checked on every request, so unpublishing takes effect at once. */
  @Get("figures/:figureId/image")
  @UseGuards(OptionalSupabaseAuthGuard)
  async image(
    @Param("figureId", IdParam) figureId: string,
    @Req() req: OptionalAuthRequest,
    @Res() reply: FastifyReply,
  ) {
    const { bytes, etag } = await this.figures.image(figureId, req.user?.id ?? null, req.headers["if-none-match"]);
    reply.header("cache-control", "private, no-cache").header("etag", etag).header("x-content-type-options", "nosniff");
    if (!bytes) return reply.status(304).send();
    return reply.type("image/png").send(bytes);
  }

  /** Publish one figure by itself. */
  @Post("figures/:figureId/publish")
  @UseGuards(SupabaseAuthGuard)
  async publish(
    @Param("figureId", IdParam) figureId: string,
    @Req() req: AuthenticatedRequest,
  ): Promise<FigureView> {
    return this.figures.setPublished(figureId, true, req.user.id);
  }

  @Delete("figures/:figureId/publish")
  @UseGuards(SupabaseAuthGuard)
  async unpublish(
    @Param("figureId", IdParam) figureId: string,
    @Req() req: AuthenticatedRequest,
  ): Promise<FigureView> {
    return this.figures.setPublished(figureId, false, req.user.id);
  }

  /** One figure; optional auth so public and link-shared ones work signed out. */
  @Get("figures/:figureId")
  @UseGuards(OptionalSupabaseAuthGuard)
  get(
    @Param("figureId", IdParam) figureId: string,
    @Req() req: OptionalAuthRequest,
  ): Promise<FigureView> {
    return this.figures.get(figureId, req.user?.id ?? null);
  }
}
