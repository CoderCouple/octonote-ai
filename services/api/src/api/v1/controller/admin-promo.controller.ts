import { Body, Controller, Get, Param, Patch, Post, Req, UseGuards } from "@nestjs/common";
import {
  PromoCodeCreateSchema,
  type PromoCodeCreate,
  type PromoCodeDto,
  type PromoRedemptionDto,
} from "@octonote/shared";
import { z } from "zod";
import { AdminGuard } from "../../../auth/admin.guard";
import type { AuthenticatedRequest } from "../../../auth/supabase-auth.guard";
import { SupabaseAuthGuard } from "../../../auth/supabase-auth.guard";
import { AdminAuditService } from "../../../common/admin-audit.service";
import { ZodValidationPipe } from "../../../common/zod-validation.pipe";
import { PromotionsService } from "../../../service/promotions.service";

const IdParam = new ZodValidationPipe(z.string().min(1).max(64));
const EnabledSchema = z.object({ enabled: z.boolean() });

/** The admin page's promo-code management. Staff only, web sessions only. */
@Controller("admin/promo-codes")
@UseGuards(SupabaseAuthGuard, AdminGuard)
export class AdminPromoController {
  constructor(
    private readonly promotions: PromotionsService,
    private readonly audit: AdminAuditService,
  ) {}

  @Get()
  list(): Promise<PromoCodeDto[]> {
    return this.promotions.list();
  }

  @Post()
  async create(
    @Body(new ZodValidationPipe(PromoCodeCreateSchema)) body: PromoCodeCreate,
    @Req() req: AuthenticatedRequest,
  ): Promise<PromoCodeDto> {
    const code = await this.promotions.create(body, req.user.id);
    await this.audit.record(req.user.id, {
      action: "promo.create",
      targetKind: "promo_code",
      targetId: code.id,
      targetLabel: code.code,
      details: { description: code.description, audience: code.audience, maxRedemptions: code.maxRedemptions },
    });
    return code;
  }

  @Patch(":id")
  async setEnabled(
    @Param("id", IdParam) id: string,
    @Body(new ZodValidationPipe(EnabledSchema)) body: { enabled: boolean },
    @Req() req: AuthenticatedRequest,
  ): Promise<PromoCodeDto> {
    const code = await this.promotions.setEnabled(id, body.enabled);
    await this.audit.record(req.user.id, {
      action: body.enabled ? "promo.enable" : "promo.disable",
      targetKind: "promo_code",
      targetId: code.id,
      targetLabel: code.code,
    });
    return code;
  }

  @Get(":id/redemptions")
  redemptions(@Param("id", IdParam) id: string): Promise<PromoRedemptionDto[]> {
    return this.promotions.redemptions(id);
  }
}
