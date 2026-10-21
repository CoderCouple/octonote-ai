import { Body, Controller, Get, Param, Patch, Post, Query, Req, UseGuards } from "@nestjs/common";
import {
  PartnerCreateSchema,
  PartnerUpdateSchema,
  type CreatorDashboard,
  type Partner,
  type PartnerCreate,
  type PartnerDetail,
  type PartnerUpdate,
} from "@octonote/shared";
import { z } from "zod";
import { AdminGuard } from "../../../auth/admin.guard";
import type { AuthenticatedRequest } from "../../../auth/supabase-auth.guard";
import { SupabaseAuthGuard } from "../../../auth/supabase-auth.guard";
import { ZodValidationPipe } from "../../../common/zod-validation.pipe";
import { PartnersService } from "../../../service/partners.service";

const IdParam = new ZodValidationPipe(z.string().min(1).max(64));
const NameQuery = z.object({ name: z.string().trim().min(1).max(100) });

/** Admin → Creators: partners, their codes, who they brought, and what they've earned. */
@Controller("admin/partners")
@UseGuards(SupabaseAuthGuard, AdminGuard)
export class AdminPartnersController {
  constructor(private readonly partners: PartnersService) {}

  @Get()
  list(): Promise<Partner[]> {
    return this.partners.list();
  }

  /** The code a new partner with this name would get (PRIYA, or PRIYA2 if taken). */
  @Get("suggest-code")
  async suggestCode(@Query(new ZodValidationPipe(NameQuery)) query: { name: string }): Promise<{ code: string }> {
    return { code: await this.partners.suggestCode(query.name) };
  }

  @Post()
  create(
    @Body(new ZodValidationPipe(PartnerCreateSchema)) body: PartnerCreate,
    @Req() req: AuthenticatedRequest,
  ): Promise<PartnerDetail> {
    return this.partners.create(body, req.user.id);
  }

  @Get(":id")
  detail(@Param("id", IdParam) id: string): Promise<PartnerDetail> {
    return this.partners.detail(id);
  }

  /** What the creator sees in Settings → Creator program, for a preview. */
  @Get(":id/creator-view")
  creatorView(@Param("id", IdParam) id: string): Promise<CreatorDashboard> {
    return this.partners.creatorView(id);
  }

  @Patch(":id")
  update(
    @Param("id", IdParam) id: string,
    @Body(new ZodValidationPipe(PartnerUpdateSchema)) body: PartnerUpdate,
    @Req() req: AuthenticatedRequest,
  ): Promise<PartnerDetail> {
    return this.partners.update(id, body, req.user.id);
  }

  /** Marks everything owed as paid out, after paying the partner. */
  @Post(":id/payout")
  payout(@Param("id", IdParam) id: string, @Req() req: AuthenticatedRequest): Promise<PartnerDetail> {
    return this.partners.markPaidOut(id, req.user.id);
  }
}
