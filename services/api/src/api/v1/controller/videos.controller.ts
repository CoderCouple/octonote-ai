import { Body, Controller, Get, HttpCode, Param, Post, Req, UseGuards } from "@nestjs/common";
import { z } from "zod";
import type { AuthenticatedRequest } from "../../../auth/supabase-auth.guard";
import { SupabaseAuthGuard } from "../../../auth/supabase-auth.guard";
import { ZodValidationPipe } from "../../../common/zod-validation.pipe";
import { VideosService } from "../../../service/videos.service";

const CreateSchema = z.object({
  workspaceId: z.string().min(1).max(64),
  concept: z.string().trim().min(3).max(1000),
  orientation: z.enum(["landscape", "portrait"]).default("landscape"),
});
const IdParam = new ZodValidationPipe(z.string().regex(/^vid_[0-9a-f-]{36}$/));

/** Starting a Manim explainer video (Pro). */
@Controller("ai/videos")
@UseGuards(SupabaseAuthGuard)
export class AiVideosController {
  constructor(private readonly videos: VideosService) {}

  @Post()
  @HttpCode(201)
  create(@Body(new ZodValidationPipe(CreateSchema)) body: z.infer<typeof CreateSchema>, @Req() req: AuthenticatedRequest) {
    return this.videos.create(req.user.id, body);
  }
}

/** A video's status and, once done, its URL and chapters. Public, like the published notes that show it. */
@Controller("videos")
export class VideosController {
  constructor(private readonly videos: VideosService) {}

  @Get(":id")
  get(@Param("id", IdParam) id: string) {
    return this.videos.get(id);
  }
}
