import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from "@nestjs/common";
import { z } from "zod";
import type { AuthenticatedRequest } from "../../../auth/supabase-auth.guard";
import { SupabaseAuthGuard } from "../../../auth/supabase-auth.guard";
import { ZodValidationPipe } from "../../../common/zod-validation.pipe";
import {
  CollectionsService,
  MODES,
} from "../../../service/collections.service";

const id = z.string().min(1).max(80);
const SourceSchema = z.object({
  app: z.enum(["chatgpt", "claude", "gemini", "octonote", "web", "other"]),
  url: z.string().max(2000).optional(),
  title: z.string().max(200).optional(),
});
const CreateSchema = z.object({
  workspaceId: id,
  name: z.string().trim().min(1).max(120),
});
const RenameSchema = z.object({ name: z.string().trim().min(1).max(120) });
const ClipSchema = z.object({
  content: z.string().min(1).max(20_000),
  source: SourceSchema.optional(),
});
const EditClipSchema = z.object({
  content: z.string().min(1).max(20_000).optional(),
  source: SourceSchema.optional(),
});
const OrderSchema = z.object({ ids: z.array(id).max(200) });
const ComposeSchema = z.object({
  mode: z.enum(MODES),
  instructions: z.string().max(2000).optional(),
  title: z.string().max(120).optional(),
});
const SaveSchema = z.object({
  title: z.string().trim().min(1).max(120),
  body: z.string().min(1).max(200_000),
  sources: z.string().max(50_000),
  mode: z.enum(MODES),
  notebook: z.string().max(120).optional(),
});

/** Research collections: named containers of clips, and documents written strictly from them. */
@Controller("collections")
@UseGuards(SupabaseAuthGuard)
export class CollectionsController {
  constructor(private readonly collections: CollectionsService) {}

  @Get()
  list(
    @Query("workspaceId") workspaceId: string,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.collections.list(req.user.id, String(workspaceId ?? ""));
  }

  @Post()
  create(
    @Body(new ZodValidationPipe(CreateSchema))
    body: z.infer<typeof CreateSchema>,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.collections.create(req.user.id, body);
  }

  @Get(":id")
  get(@Param("id") collectionId: string, @Req() req: AuthenticatedRequest) {
    return this.collections.get(req.user.id, collectionId);
  }

  @Patch(":id")
  rename(
    @Param("id") collectionId: string,
    @Body(new ZodValidationPipe(RenameSchema))
    body: z.infer<typeof RenameSchema>,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.collections.rename(req.user.id, collectionId, body.name);
  }

  @Delete(":id")
  @HttpCode(204)
  async remove(
    @Param("id") collectionId: string,
    @Req() req: AuthenticatedRequest,
  ) {
    await this.collections.remove(req.user.id, collectionId);
  }

  @Post(":id/clips")
  addClip(
    @Param("id") collectionId: string,
    @Body(new ZodValidationPipe(ClipSchema)) body: z.infer<typeof ClipSchema>,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.collections.addClip(req.user.id, collectionId, body);
  }

  @Post(":id/order")
  @HttpCode(200)
  reorder(
    @Param("id") collectionId: string,
    @Body(new ZodValidationPipe(OrderSchema)) body: z.infer<typeof OrderSchema>,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.collections.reorder(req.user.id, collectionId, body.ids);
  }

  @Patch("clips/:clipId")
  editClip(
    @Param("clipId") clipId: string,
    @Body(new ZodValidationPipe(EditClipSchema))
    body: z.infer<typeof EditClipSchema>,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.collections.editClip(req.user.id, clipId, body);
  }

  @Delete("clips/:clipId")
  @HttpCode(204)
  async removeClip(
    @Param("clipId") clipId: string,
    @Req() req: AuthenticatedRequest,
  ) {
    await this.collections.removeClip(req.user.id, clipId);
  }

  /** A document written strictly from the clips, checked; nothing is saved yet. */
  @Post(":id/compose")
  @HttpCode(200)
  compose(
    @Param("id") collectionId: string,
    @Body(new ZodValidationPipe(ComposeSchema))
    body: z.infer<typeof ComposeSchema>,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.collections.compose(req.user.id, collectionId, body);
  }

  /** Saves a reviewed draft as a note. */
  @Post(":id/save")
  @HttpCode(200)
  save(
    @Param("id") collectionId: string,
    @Body(new ZodValidationPipe(SaveSchema)) body: z.infer<typeof SaveSchema>,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.collections.save(req.user.id, collectionId, body);
  }
}
