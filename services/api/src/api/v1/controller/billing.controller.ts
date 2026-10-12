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
import type { BillingSummary } from "@octonote/shared";
import { z } from "zod";
import type { AuthenticatedRequest } from "../../../auth/supabase-auth.guard";
import { SupabaseAuthGuard } from "../../../auth/supabase-auth.guard";
import { ZodValidationPipe } from "../../../common/zod-validation.pipe";
import { BillingService } from "../../../service/billing.service";

const IdParam = new ZodValidationPipe(z.string().min(1).max(64));
const CheckoutSchema = z.object({ interval: z.enum(["month", "year"]) });

@Controller("workspaces/:workspaceId/billing")
@UseGuards(SupabaseAuthGuard)
export class BillingController {
  constructor(private readonly billing: BillingService) {}

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
    return this.billing.checkout(workspaceId, body.interval, req.user.id);
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
