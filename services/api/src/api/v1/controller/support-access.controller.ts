import { Body, Controller, Delete, Get, Param, Post, Put, Req, UseGuards } from "@nestjs/common";
import {
  SupportGrantSchema,
  SupportSessionStartSchema,
  type AdminSupportStatus,
  type SupportAccessStatus,
  type SupportGrantInput,
  type SupportSessionInfo,
  type SupportSessionStarted,
  type SupportSessionStartInput,
} from "@octonote/shared";
import { z } from "zod";
import { AdminGuard } from "../../../auth/admin.guard";
import type { AuthenticatedRequest } from "../../../auth/supabase-auth.guard";
import { SupabaseAuthGuard } from "../../../auth/supabase-auth.guard";
import { NotFound } from "../../../common/error/error-factory";
import { requireWebSession } from "../../../common/require-web-session";
import { ZodValidationPipe } from "../../../common/zod-validation.pipe";
import { SupportAccessService } from "../../../service/support-access.service";

const IdParam = new ZodValidationPipe(z.string().min(1).max(64));

/** Settings → Privacy → Support access: the person's own switch and history. */
@Controller("me/support-access")
@UseGuards(SupabaseAuthGuard)
export class SupportAccessController {
  constructor(private readonly support: SupportAccessService) {}

  @Get()
  status(@Req() req: AuthenticatedRequest): Promise<SupportAccessStatus> {
    return this.support.status(req.user.id);
  }

  @Put()
  grant(
    @Body(new ZodValidationPipe(SupportGrantSchema)) body: SupportGrantInput,
    @Req() req: AuthenticatedRequest,
  ): Promise<SupportAccessStatus> {
    requireWebSession(req, "Allowing support access");
    return this.support.grant(req.user.id, body.days);
  }

  @Delete()
  revoke(@Req() req: AuthenticatedRequest): Promise<SupportAccessStatus> {
    requireWebSession(req, "Changing support access");
    return this.support.revoke(req.user.id);
  }
}

/** Called from inside a support tab (support token): the banner and Exit. */
@Controller("support-session")
@UseGuards(SupabaseAuthGuard)
export class SupportSessionController {
  constructor(private readonly support: SupportAccessService) {}

  @Get()
  info(@Req() req: AuthenticatedRequest): Promise<SupportSessionInfo> {
    if (!req.user.supportSessionId) throw NotFound("Not a support session.");
    return this.support.info(req.user.supportSessionId);
  }

  @Delete()
  async end(@Req() req: AuthenticatedRequest): Promise<{ ended: true }> {
    if (!req.user.supportSessionId || !req.user.supportAdminId) throw NotFound("Not a support session.");
    await this.support.end(req.user.supportSessionId, req.user.supportAdminId);
    return { ended: true };
  }
}

/** Admin → a person → Support access. Staff only, web sessions only. */
@Controller("admin/support")
@UseGuards(SupabaseAuthGuard, AdminGuard)
export class AdminSupportController {
  constructor(private readonly support: SupportAccessService) {}

  @Get("users/:id")
  status(@Param("id", IdParam) id: string): Promise<AdminSupportStatus> {
    return this.support.adminStatus(id);
  }

  @Post("sessions")
  start(
    @Body(new ZodValidationPipe(SupportSessionStartSchema)) body: SupportSessionStartInput,
    @Req() req: AuthenticatedRequest,
  ): Promise<SupportSessionStarted> {
    return this.support.start(req.user.id, body);
  }

  @Post("sessions/:id/end")
  async end(@Param("id", IdParam) id: string, @Req() req: AuthenticatedRequest): Promise<{ ended: true }> {
    await this.support.end(id, req.user.id);
    return { ended: true };
  }
}
