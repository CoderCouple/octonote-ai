import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Put,
  Req,
  UseGuards,
} from "@nestjs/common";
import { z } from "zod";
import type { AuthenticatedRequest } from "../../../auth/supabase-auth.guard";
import { SupabaseAuthGuard } from "../../../auth/supabase-auth.guard";
import { ZodValidationPipe } from "../../../common/zod-validation.pipe";
import { AiKeysService } from "../../../service/ai-keys.service";

const SetKeySchema = z.object({ key: z.string().trim().min(10).max(300) });

/** Bring your own key: the person's Anthropic key for their AI calls. The key itself is never returned. */
@Controller("me/ai-key")
@UseGuards(SupabaseAuthGuard)
export class AiKeyController {
  constructor(private readonly keys: AiKeysService) {}

  @Get()
  status(@Req() req: AuthenticatedRequest) {
    return this.keys.status(req.user.id);
  }

  @Put()
  set(
    @Body(new ZodValidationPipe(SetKeySchema))
    body: z.infer<typeof SetKeySchema>,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.keys.set(req.user.id, body.key);
  }

  @Delete()
  @HttpCode(204)
  async remove(@Req() req: AuthenticatedRequest) {
    await this.keys.remove(req.user.id);
  }
}
