import { Body, Controller, HttpCode, Post, Req, UseGuards } from "@nestjs/common";
import { z } from "zod";
import type { AuthenticatedRequest } from "../../../auth/supabase-auth.guard";
import { SupabaseAuthGuard } from "../../../auth/supabase-auth.guard";
import { ZodValidationPipe } from "../../../common/zod-validation.pipe";
import { ComposeAiService } from "../../../service/compose-ai.service";

const ComposeSchema = z.object({ request: z.string().trim().min(1).max(2000) });
const EditBlockSchema = z.object({
  kind: z.string().min(1).max(32),
  spec: z.record(z.unknown()),
  instruction: z.string().trim().min(1).max(1000),
});

/** AI for interactive note blocks. Needs ANTHROPIC_API_KEY on the API. */
@Controller("ai")
@UseGuards(SupabaseAuthGuard)
export class AiController {
  constructor(private readonly ai: ComposeAiService) {}

  /** A note section for a request, as markdown with interactive fences. */
  @Post("compose")
  @HttpCode(200)
  compose(@Body(new ZodValidationPipe(ComposeSchema)) body: z.infer<typeof ComposeSchema>, @Req() req: AuthenticatedRequest) {
    return this.ai.compose(req.user.id, body.request);
  }

  /** One interactive block, changed as asked. */
  @Post("blocks/edit")
  @HttpCode(200)
  editBlock(@Body(new ZodValidationPipe(EditBlockSchema)) body: z.infer<typeof EditBlockSchema>, @Req() req: AuthenticatedRequest) {
    return this.ai.editBlock(req.user.id, body);
  }
}
