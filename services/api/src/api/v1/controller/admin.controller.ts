import { Body, Controller, Get, Param, Patch, Post, Query, Req, UseGuards } from "@nestjs/common";
import {
  AdminCancelSchema,
  AdminGrantSchema,
  StudentDomainCreateSchema,
  type AdminAuditEntry,
  type AdminCancelInput,
  type AdminGrantInput,
  type AdminUserDetail,
  type AdminUserRow,
  type AdminWorkspaceDetail,
  type StudentDomain,
  type StudentDomainCreate,
} from "@octonote/shared";
import { z } from "zod";
import { AdminGuard } from "../../../auth/admin.guard";
import type { AuthenticatedRequest } from "../../../auth/supabase-auth.guard";
import { SupabaseAuthGuard } from "../../../auth/supabase-auth.guard";
import { AdminAuditService } from "../../../common/admin-audit.service";
import { ZodValidationPipe } from "../../../common/zod-validation.pipe";
import { AdminService } from "../../../service/admin.service";

const IdParam = new ZodValidationPipe(z.string().min(1).max(64));
const SearchQuery = z.object({ q: z.string().max(200).default("") });
const AuditQuery = z.object({
  before: z.string().datetime().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});
const EnabledSchema = z.object({ enabled: z.boolean() });

/** The admin portal: people, workspaces, grants, student domains, audit log. Staff only, web sessions only. */
@Controller("admin")
@UseGuards(SupabaseAuthGuard, AdminGuard)
export class AdminController {
  constructor(
    private readonly admin: AdminService,
    private readonly audit: AdminAuditService,
  ) {}

  /** One-time sign-in for the portal's own address. */
  @Post("handoff")
  handoff(@Req() req: AuthenticatedRequest): Promise<{ tokenHash: string }> {
    return this.admin.handoff(req.user.id);
  }

  @Get("users")
  users(@Query(new ZodValidationPipe(SearchQuery)) query: { q: string }): Promise<AdminUserRow[]> {
    return this.admin.searchUsers(query.q);
  }

  @Get("users/:id")
  user(@Param("id", IdParam) id: string): Promise<AdminUserDetail> {
    return this.admin.user(id);
  }

  @Get("workspaces/:id")
  workspace(@Param("id", IdParam) id: string): Promise<AdminWorkspaceDetail> {
    return this.admin.workspace(id);
  }

  @Post("workspaces/:id/grants")
  grant(
    @Param("id", IdParam) id: string,
    @Body(new ZodValidationPipe(AdminGrantSchema)) body: AdminGrantInput,
    @Req() req: AuthenticatedRequest,
  ): Promise<AdminWorkspaceDetail> {
    return this.admin.grant(id, body, req.user.id);
  }

  @Post("grants/:id/end")
  endGrant(@Param("id", IdParam) id: string, @Req() req: AuthenticatedRequest): Promise<AdminWorkspaceDetail> {
    return this.admin.endGrant(id, req.user.id);
  }

  @Post("workspaces/:id/cancel-subscription")
  cancelNow(
    @Param("id", IdParam) id: string,
    @Body(new ZodValidationPipe(AdminCancelSchema)) body: AdminCancelInput,
    @Req() req: AuthenticatedRequest,
  ): Promise<AdminWorkspaceDetail> {
    return this.admin.cancelNow(id, body, req.user.id);
  }

  @Get("student-domains")
  studentDomains(): Promise<StudentDomain[]> {
    return this.admin.studentDomains();
  }

  @Post("student-domains")
  addStudentDomain(
    @Body(new ZodValidationPipe(StudentDomainCreateSchema)) body: StudentDomainCreate,
    @Req() req: AuthenticatedRequest,
  ): Promise<StudentDomain[]> {
    return this.admin.addStudentDomain(body, req.user.id);
  }

  @Patch("student-domains/:id")
  setStudentDomainEnabled(
    @Param("id", IdParam) id: string,
    @Body(new ZodValidationPipe(EnabledSchema)) body: { enabled: boolean },
    @Req() req: AuthenticatedRequest,
  ): Promise<StudentDomain[]> {
    return this.admin.setStudentDomainEnabled(id, body.enabled, req.user.id);
  }

  @Get("audit")
  auditLog(@Query(new ZodValidationPipe(AuditQuery)) query: { before?: string; limit: number }): Promise<AdminAuditEntry[]> {
    return this.audit.list(query.limit, query.before);
  }
}
