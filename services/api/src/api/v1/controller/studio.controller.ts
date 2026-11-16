import { CreateStudioItemSchema, STUDIO_LIMITS, type CreateStudioItemInput } from "@octonote/shared";
import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Put, Query, Req, UseGuards } from "@nestjs/common";
import { z } from "zod";
import type { OptionalAuthRequest } from "../../../auth/optional-supabase-auth.guard";
import { OptionalSupabaseAuthGuard } from "../../../auth/optional-supabase-auth.guard";
import type { AuthenticatedRequest } from "../../../auth/supabase-auth.guard";
import { SupabaseAuthGuard } from "../../../auth/supabase-auth.guard";
import { ZodValidationPipe } from "../../../common/zod-validation.pipe";
import { StudioService } from "../../../service/studio.service";

const IdParam = new ZodValidationPipe(z.string().min(1).max(80));
const WorkspaceQuery = new ZodValidationPipe(z.string().min(1).max(80));
const RenameSchema = z.object({ title: z.string().trim().min(1).max(STUDIO_LIMITS.title) });
const AddToNoteSchema = z.object({ noteId: z.string().min(1).max(80).optional(), workspaceId: z.string().min(1).max(80).optional() });

/** Studio: sources turned into infographics, mind maps, flashcards, quizzes and more. */
@Controller("studio")
export class StudioController {
  constructor(private readonly studio: StudioService) {}

  @Get()
  @UseGuards(SupabaseAuthGuard)
  list(@Query("workspaceId", WorkspaceQuery) workspaceId: string, @Req() req: AuthenticatedRequest) {
    return this.studio.list(req.user.id, workspaceId);
  }

  @Post()
  @UseGuards(SupabaseAuthGuard)
  create(@Body(new ZodValidationPipe(CreateStudioItemSchema)) body: CreateStudioItemInput, @Req() req: AuthenticatedRequest) {
    return this.studio.create(req.user.id, body);
  }

  /** One item: its maker sees everything; anyone else only a published item, without its source text. */
  @Get(":id")
  @UseGuards(OptionalSupabaseAuthGuard)
  get(@Param("id", IdParam) id: string, @Req() req: OptionalAuthRequest) {
    return this.studio.get(req.user?.id ?? null, id);
  }

  @Patch(":id")
  @UseGuards(SupabaseAuthGuard)
  rename(@Param("id", IdParam) id: string, @Body(new ZodValidationPipe(RenameSchema)) body: z.infer<typeof RenameSchema>, @Req() req: AuthenticatedRequest) {
    return this.studio.rename(req.user.id, id, body.title);
  }

  @Delete(":id")
  @HttpCode(204)
  @UseGuards(SupabaseAuthGuard)
  async remove(@Param("id", IdParam) id: string, @Req() req: AuthenticatedRequest): Promise<void> {
    await this.studio.remove(req.user.id, id);
  }

  @Post(":id/retry")
  @HttpCode(200)
  @UseGuards(SupabaseAuthGuard)
  retry(@Param("id", IdParam) id: string, @Req() req: AuthenticatedRequest) {
    return this.studio.retry(req.user.id, id);
  }

  @Put(":id/publish")
  @UseGuards(SupabaseAuthGuard)
  publish(@Param("id", IdParam) id: string, @Req() req: AuthenticatedRequest) {
    return this.studio.setPublished(req.user.id, id, true);
  }

  @Delete(":id/publish")
  @UseGuards(SupabaseAuthGuard)
  unpublish(@Param("id", IdParam) id: string, @Req() req: AuthenticatedRequest) {
    return this.studio.setPublished(req.user.id, id, false);
  }

  /** Appends the item to a note (noteId), or makes a new note from it. */
  @Post(":id/note")
  @HttpCode(200)
  @UseGuards(SupabaseAuthGuard)
  addToNote(@Param("id", IdParam) id: string, @Body(new ZodValidationPipe(AddToNoteSchema)) body: z.infer<typeof AddToNoteSchema>, @Req() req: AuthenticatedRequest) {
    return this.studio.addToNote(req.user.id, id, body);
  }
}
