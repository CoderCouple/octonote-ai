import { Controller, Get, Param, Query, Req, Res, UseGuards } from "@nestjs/common";
import type { FastifyReply } from "fastify";
import { z } from "zod";
import type { AuthenticatedRequest } from "../../../auth/supabase-auth.guard";
import { SupabaseAuthGuard } from "../../../auth/supabase-auth.guard";
import { ZodValidationPipe } from "../../../common/zod-validation.pipe";
import {
  ExtensionItemsService,
  ITEMS_DEFAULT_LIMIT,
  ITEMS_MAX_LIMIT,
  type ExtensionItem,
  type ExtensionItemSummary,
} from "../../../service/extension-items.service";

const IdParam = new ZodValidationPipe(z.string().min(1).max(64));
const ListQuery = z.object({
  workspaceId: z.string().min(1).max(80),
  q: z.string().max(200).optional(),
  limit: z.coerce.number().int().min(1).max(ITEMS_MAX_LIMIT).default(ITEMS_DEFAULT_LIMIT),
});

/**
 * Reading the person's notes, canvases and projects from the browser
 * extension, to insert into a chat. Clipper tokens may call these only when
 * the person allowed reading ("clipper_read", see cli-token-scope.ts); web
 * sessions and full CLI tokens may too.
 */
@Controller("extension/items")
@UseGuards(SupabaseAuthGuard)
export class ExtensionItemsController {
  constructor(private readonly items: ExtensionItemsService) {}

  @Get()
  list(
    @Query(new ZodValidationPipe(ListQuery)) query: z.infer<typeof ListQuery>,
    @Req() req: AuthenticatedRequest,
  ): Promise<ExtensionItemSummary[]> {
    return this.items.list(req.user.id, query);
  }

  @Get(":id")
  get(@Param("id", IdParam) id: string, @Req() req: AuthenticatedRequest): Promise<ExtensionItem> {
    return this.items.get(req.user.id, id);
  }

  /** The canvas picture as raw PNG bytes (no response envelope). */
  @Get(":id/image")
  async image(@Param("id", IdParam) id: string, @Req() req: AuthenticatedRequest, @Res() reply: FastifyReply) {
    const bytes = await this.items.image(req.user.id, id);
    reply.header("cache-control", "private, max-age=300").header("x-content-type-options", "nosniff");
    return reply.type("image/png").send(bytes);
  }
}
