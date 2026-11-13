import { Body, Controller, HttpCode, HttpStatus, Post, Req, UseGuards } from "@nestjs/common";
import type { FastifyRequest } from "fastify";
import { z } from "zod";
import type { AuthenticatedRequest } from "../../../auth/supabase-auth.guard";
import { SupabaseAuthGuard } from "../../../auth/supabase-auth.guard";
import { AppError } from "../../../common/error/app-error";
import { ErrorCode } from "../../../common/error/error-codes";
import { BadRequest } from "../../../common/error/error-factory";
import { requireWebSession } from "../../../common/require-web-session";
import { ZodValidationPipe } from "../../../common/zod-validation.pipe";
import {
  CONNECT_EXPIRED_MESSAGE,
  ExtensionConnectService,
} from "../../../service/extension-connect.service";

const CodeSchema = z.object({
  workspaceId: z.string().min(1).max(80),
  challenge: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
  /** The extension asks to read notes, canvases and projects too ("clipper_read"). */
  read: z.boolean().optional(),
});
const TokenSchema = z.object({
  code: z.string().min(1).max(200),
  verifier: z.string().regex(/^[A-Za-z0-9_-]{43,128}$/),
});

/** Token exchanges per client address per minute (in memory, per API instance). */
export const MAX_EXCHANGES_PER_MINUTE = 10;
const MINUTE = 60_000;

/**
 * The client's address: the last X-Forwarded-For hop is the one our proxy
 * (Railway) added, so a client can't pick its own; locally there's none.
 */
function clientAddress(req: FastifyRequest) {
  const forwarded = String(req.headers["x-forwarded-for"] ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return forwarded.at(-1) ?? req.ip ?? "unknown";
}

/** Connecting the Octonote Clipper browser extension (see ExtensionConnectService). */
@Controller("extension")
export class ExtensionConnectController {
  private readonly recent = new Map<string, number[]>();

  constructor(private readonly connect: ExtensionConnectService) {}

  /** The connect page, signed in on the web, mints a one-time code. */
  @Post("connect-codes")
  @UseGuards(SupabaseAuthGuard)
  createCode(
    @Body(new ZodValidationPipe(CodeSchema)) body: z.infer<typeof CodeSchema>,
    @Req() req: AuthenticatedRequest,
  ) {
    requireWebSession(req, "Connecting the browser extension");
    return this.connect.createCode(req.user.id, body);
  }

  /** Public: the extension trades code + verifier for a clipper token. */
  @Post("token")
  @HttpCode(200)
  exchange(@Body() body: unknown, @Req() req: FastifyRequest) {
    this.limit(clientAddress(req));
    const parsed = TokenSchema.safeParse(body);
    if (!parsed.success) throw BadRequest(CONNECT_EXPIRED_MESSAGE, { code: "CONNECT_EXPIRED" });
    return this.connect.exchange(parsed.data);
  }

  private limit(address: string) {
    const now = Date.now();
    const calls = (this.recent.get(address) ?? []).filter((t) => now - t < MINUTE);
    if (calls.length >= MAX_EXCHANGES_PER_MINUTE) {
      throw new AppError(
        ErrorCode.RATE_LIMITED,
        "Too many attempts. Wait a minute and try again.",
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    calls.push(now);
    this.recent.set(address, calls);
    if (this.recent.size > 10_000) {
      for (const [key, times] of this.recent) {
        if (!times.some((t) => now - t < MINUTE)) this.recent.delete(key);
      }
    }
  }
}
