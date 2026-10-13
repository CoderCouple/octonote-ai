import { Body, Controller, Delete, Get, Param, Post, Req, UseGuards } from "@nestjs/common";
import { z } from "zod";
import type { AuthenticatedRequest } from "../../../auth/supabase-auth.guard";
import { SupabaseAuthGuard } from "../../../auth/supabase-auth.guard";
import { NotFound } from "../../../common/error/error-factory";
import { requireWebSession } from "../../../common/require-web-session";
import { ZodValidationPipe } from "../../../common/zod-validation.pipe";
import { CliTokensService, type CliTokenDto } from "../../../service/cli-tokens.service";

// Defined before the class: decorator arguments run when the class is defined.
const CreateTokenSchema = z.object({
  name: z.string().trim().min(1).max(80),
  expiresInDays: z.number().int().min(1).max(3650).optional(),
});

/** Tokens for the `octonote` CLI and agents (Settings → CLI & agents). */
@Controller("me/cli-tokens")
@UseGuards(SupabaseAuthGuard)
export class CliTokensController {
  constructor(private readonly tokens: CliTokensService) {}

  @Get()
  list(@Req() req: AuthenticatedRequest): Promise<CliTokenDto[]> {
    return this.tokens.list(req.user.id);
  }

  /** Returns the token itself exactly once. Web sessions only. */
  @Post()
  async create(
    @Body(new ZodValidationPipe(CreateTokenSchema)) body: { name: string; expiresInDays?: number },
    @Req() req: AuthenticatedRequest,
  ): Promise<{ token: CliTokenDto; plaintext: string }> {
    requireWebSession(req, "Creating a CLI token");
    return this.tokens.create(req.user.id, body);
  }

  /** `octonote logout`: revoke the token making this request. */
  @Delete("current")
  async revokeCurrent(@Req() req: AuthenticatedRequest): Promise<CliTokenDto> {
    if (!req.user.cliTokenId) throw NotFound("This request didn't use a CLI token.");
    return this.tokens.revoke(req.user.cliTokenId, req.user.id);
  }

  @Delete(":id")
  revoke(@Param("id") id: string, @Req() req: AuthenticatedRequest): Promise<CliTokenDto> {
    return this.tokens.revoke(id, req.user.id);
  }
}
