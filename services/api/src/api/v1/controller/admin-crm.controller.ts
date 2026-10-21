import { Body, Controller, Delete, Get, Param, Patch, Post, Req, UseGuards } from "@nestjs/common";
import {
  CrmEmailSchema,
  CrmFollowupCreateSchema,
  CrmFollowupUpdateSchema,
  CrmLogSchema,
  CrmStatusSchema,
  type CrmEmailInput,
  type CrmFollowupCreate,
  type CrmFollowupUpdate,
  type CrmLogInput,
  type CrmPersonDetail,
  type CrmPersonRow,
  type CrmStatus,
} from "@octonote/shared";
import { z } from "zod";
import { AdminGuard } from "../../../auth/admin.guard";
import type { AuthenticatedRequest } from "../../../auth/supabase-auth.guard";
import { SupabaseAuthGuard } from "../../../auth/supabase-auth.guard";
import { ZodValidationPipe } from "../../../common/zod-validation.pipe";
import { AdminCrmService } from "../../../service/admin-crm.service";

const IdParam = new ZodValidationPipe(z.string().min(1).max(64));

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

  @Patch("people/:id")
  setStatus(
    @Param("id", IdParam) id: string,
    @Body(new ZodValidationPipe(CrmStatusSchema)) body: { status: CrmStatus },
    @Req() req: AuthenticatedRequest,
  ): Promise<CrmPersonDetail> {
    return this.crm.setStatus(id, body.status, req.user.id);
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
