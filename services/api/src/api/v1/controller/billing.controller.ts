import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Post,
  Req,
  UseGuards,
} from "@nestjs/common";
import {
  PromoApplySchema,
  type BillingInvoice,
  type BillingSummary,
  type PromoApplyResult,
} from "@octonote/shared";
import { z } from "zod";
import type { AuthenticatedRequest } from "../../../auth/supabase-auth.guard";
import { SupabaseAuthGuard } from "../../../auth/supabase-auth.guard";
import { ZodValidationPipe } from "../../../common/zod-validation.pipe";
import { BillingService } from "../../../service/billing.service";
import { PromotionsService } from "../../../service/promotions.service";

const IdParam = new ZodValidationPipe(z.string().min(1).max(64));
const CheckoutSchema = z.object({
  interval: z.enum(["month", "year"]),
  /** A discount code already checked with POST …/billing/code. */
  code: z.string().trim().min(3).max(40).optional(),
});
const IntervalSchema = z.object({ interval: z.enum(["month", "year"]) });

@Controller("workspaces/:workspaceId/billing")
@UseGuards(SupabaseAuthGuard)
export class BillingController {
  constructor(
    private readonly billing: BillingService,
    private readonly promotions: PromotionsService,
  ) {}

  @Get()
  summary(
    @Param("workspaceId", IdParam) workspaceId: string,
    @Req() req: AuthenticatedRequest,
  ): Promise<BillingSummary> {
    return this.billing.summary(workspaceId, req.user.id);
  }

  @Post("checkout")
  checkout(
    @Param("workspaceId", IdParam) workspaceId: string,
    @Body(new ZodValidationPipe(CheckoutSchema)) body: z.infer<typeof CheckoutSchema>,
    @Req() req: AuthenticatedRequest,
  ): Promise<{ url: string }> {
    return this.billing.checkout(workspaceId, body.interval, req.user.id, body.code);
  }

  /** "Have a code?": a free code is redeemed now; a discount is checked for checkout. */
  @Post("code")
  applyCode(
    @Param("workspaceId", IdParam) workspaceId: string,
    @Body(new ZodValidationPipe(PromoApplySchema)) body: { code: string },
    @Req() req: AuthenticatedRequest,
  ): Promise<PromoApplyResult> {
    return this.promotions.apply(workspaceId, body.code, req.user.id);
  }

  @Get("invoices")
  invoices(
    @Param("workspaceId", IdParam) workspaceId: string,
    @Req() req: AuthenticatedRequest,
  ): Promise<BillingInvoice[]> {
    return this.billing.invoices(workspaceId, req.user.id);
  }

  @Post("cancel")
  cancel(
    @Param("workspaceId", IdParam) workspaceId: string,
    @Req() req: AuthenticatedRequest,
  ): Promise<BillingSummary> {
    return this.billing.setCancelAtPeriodEnd(workspaceId, true, req.user.id);
  }

  @Post("resume")
  resume(
    @Param("workspaceId", IdParam) workspaceId: string,
    @Req() req: AuthenticatedRequest,
  ): Promise<BillingSummary> {
    return this.billing.setCancelAtPeriodEnd(workspaceId, false, req.user.id);
  }

  @Post("interval")
  changeInterval(
    @Param("workspaceId", IdParam) workspaceId: string,
    @Body(new ZodValidationPipe(IntervalSchema)) body: { interval: "month" | "year" },
    @Req() req: AuthenticatedRequest,
  ): Promise<BillingSummary> {
    return this.billing.changeInterval(workspaceId, body.interval, req.user.id);
  }

  @Post("portal")
  portal(
    @Param("workspaceId", IdParam) workspaceId: string,
    @Req() req: AuthenticatedRequest,
  ): Promise<{ url: string }> {
    return this.billing.portal(workspaceId, req.user.id);
  }
}

/** Stripe → us. No user auth: the Stripe signature over the raw body is the auth. */
@Controller("billing")
export class BillingWebhookController {
  constructor(private readonly billing: BillingService) {}

  @Post("webhook")
  async webhook(
    // `rawBody` is filled because main.ts creates the app with { rawBody: true }.
    @Req() req: { rawBody?: Buffer },
    @Headers("stripe-signature") signature: string | undefined,
  ): Promise<{ received: true }> {
    await this.billing.handleWebhook(req.rawBody ?? "", signature);
    return { received: true };
  }
}
