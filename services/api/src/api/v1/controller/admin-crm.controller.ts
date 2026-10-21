import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query, Req, UseGuards } from "@nestjs/common";
import {
  CrmEmailSchema,
  CrmFollowupCreateSchema,
  CrmFollowupUpdateSchema,
  CrmLogSchema,
  CrmContactUpdateSchema,
  type CrmEmailInput,
  type CrmFollowupCreate,
  type CrmFollowupUpdate,
  type CrmLogInput,
  type CrmPersonDetail,
  type CrmPersonRow,
  type CrmContactUpdate,
  type CrmOverview,
} from "@octonote/shared";
import { z } from "zod";
import { AdminGuard } from "../../../auth/admin.guard";
import type { AuthenticatedRequest } from "../../../auth/supabase-auth.guard";
import { SupabaseAuthGuard } from "../../../auth/supabase-auth.guard";
import { ZodValidationPipe } from "../../../common/zod-validation.pipe";
import { AdminCrmService } from "../../../service/admin-crm.service";

const IdParam = new ZodValidationPipe(z.string().min(1).max(64));
const OverviewQuery = z.object({
  owner: z.string().min(1).max(64).optional(),
  weeks: z.coerce.number().int().min(4).max(26).default(8),
});

/** Admin → Inbox: the follow-ups CRM. Staff only, web sessions only. */
@Controller("admin/crm")
@UseGuards(SupabaseAuthGuard, AdminGuard)
export class AdminCrmController {
  constructor(private readonly crm: AdminCrmService) {}

  @Get("people")
  people(): Promise<CrmPersonRow[]> {
    return this.crm.people();
  }

  @Get("staff")
  staff(): Promise<{ id: string; name: string; email: string }[]> {
    return this.crm.staff();
  }

  @Get("people/:id")
  person(@Param("id", IdParam) id: string): Promise<CrmPersonDetail> {
    return this.crm.person(id);
  }

  /** The person was opened in the Inbox: their replies so far are read. */
  @Post("people/:id/seen")
  async seen(@Param("id", IdParam) id: string): Promise<{ ok: true }> {
    await this.crm.markSeen(id);
    return { ok: true };
  }

  /** Status and/or owner. */
  @Patch("people/:id")
  update(
    @Param("id", IdParam) id: string,
    @Body(new ZodValidationPipe(CrmContactUpdateSchema)) body: CrmContactUpdate,
    @Req() req: AuthenticatedRequest,
  ): Promise<CrmPersonDetail> {
    return this.crm.updateContact(id, body, req.user.id);
  }

  /** Admin → Follow-ups: pipeline, outreach per week and the day's lists, for everyone or one owner. */
  @Get("overview")
  overview(@Query(new ZodValidationPipe(OverviewQuery)) q: { owner?: string; weeks: number }): Promise<CrmOverview> {
    return this.crm.overview(q.owner ?? null, q.weeks);
  }

  /** Log a LinkedIn message, a call, a note… */
  @Post("people/:id/entries")
  log(
    @Param("id", IdParam) id: string,
    @Body(new ZodValidationPipe(CrmLogSchema)) body: CrmLogInput,
    @Req() req: AuthenticatedRequest,
  ): Promise<CrmPersonDetail> {
    return this.crm.log(id, body, req.user.id);
  }

  /** Send an email from hello@octonote.ai as the signed-in staff member. */
  @Post("people/:id/email")
  sendEmail(
    @Param("id", IdParam) id: string,
    @Body(new ZodValidationPipe(CrmEmailSchema)) body: CrmEmailInput,
    @Req() req: AuthenticatedRequest,
  ): Promise<CrmPersonDetail> {
    return this.crm.sendEmail(id, body, req.user.id);
  }

  @Delete("entries/:id")
  deleteEntry(@Param("id", IdParam) id: string, @Req() req: AuthenticatedRequest): Promise<CrmPersonDetail> {
    return this.crm.deleteEntry(id, req.user.id);
  }

  @Post("people/:id/followups")
  addFollowup(
    @Param("id", IdParam) id: string,
    @Body(new ZodValidationPipe(CrmFollowupCreateSchema)) body: CrmFollowupCreate,
    @Req() req: AuthenticatedRequest,
  ): Promise<CrmPersonDetail> {
    return this.crm.addFollowup(id, body, req.user.id);
  }

  @Patch("followups/:id")
  updateFollowup(
    @Param("id", IdParam) id: string,
    @Body(new ZodValidationPipe(CrmFollowupUpdateSchema)) body: CrmFollowupUpdate,
  ): Promise<CrmPersonDetail> {
    return this.crm.updateFollowup(id, body);
  }
}

/**
 * Resend → us: an email arrived at reply.octonote.ai. No user auth: Resend's
 * signature over the raw body (svix-* headers) is the auth.
 */
@Controller("crm")
export class CrmInboundController {
  constructor(private readonly crm: AdminCrmService) {}

  @Post("inbound")
  @HttpCode(200)
  async inbound(
    // `rawBody` is filled because main.ts creates the app with { rawBody: true }.
    @Req() req: { rawBody?: Buffer; headers: Record<string, string | string[] | undefined> },
  ): Promise<{ ok: true }> {
    const h = (name: string) => {
      const v = req.headers[name];
      return Array.isArray(v) ? v[0] : v;
    };
    await this.crm.receive(req.rawBody?.toString("utf8") ?? "", {
      id: h("svix-id"),
      timestamp: h("svix-timestamp"),
      signature: h("svix-signature"),
    });
    return { ok: true };
  }
}
