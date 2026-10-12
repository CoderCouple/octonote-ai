/**
 * Plan & billing for a workspace, backed by Stripe (hosted Checkout to
 * upgrade, the hosted Billing Portal to manage or cancel). Stripe is the
 * source of truth; its webhook mirrors subscription state into
 * `workspace_billing`, which PlanLimitsService reads.
 *
 * Env: STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, STRIPE_PRICE_PRO_MONTH,
 * STRIPE_PRICE_PRO_YEAR, PUBLIC_APP_URL (redirects). Without the secret key
 * billing reports `billingEnabled: false` and limits aren't enforced.
 */
import { Inject, Injectable, Logger } from "@nestjs/common";
import {
  FREE_LIMITS,
  type BillingInterval,
  type BillingSummary,
} from "@octonote/shared";
import { eq } from "drizzle-orm";
import type Stripe from "stripe";
import { BadRequest, Conflict } from "../common/error/error-factory";
import { PlanLimitsService } from "../common/plan-limits.service";
import { Database, DRIZZLE } from "../db/database.module";
import { workspaceBilling } from "../db/schemas/billing";
import { users } from "../db/schemas/users";
import { appUrl } from "./lib/resource-url";
import { WorkspacesService } from "./workspaces.service";

export const STRIPE_CLIENT = Symbol("STRIPE_CLIENT");

export interface BillingConfig {
  webhookSecret?: string;
  prices: Partial<Record<BillingInterval, string>>;
}
export const BILLING_CONFIG = Symbol("BILLING_CONFIG");

const MEMBER_ROLES = ["OWNER", "ADMIN", "MEMBER"] as const;
const MANAGER_ROLES = ["OWNER", "ADMIN"] as const;

@Injectable()
export class BillingService {
  private readonly logger = new Logger(BillingService.name);

  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly planLimits: PlanLimitsService,
    private readonly workspaces: WorkspacesService,
    @Inject(STRIPE_CLIENT) private readonly stripe: Stripe | null,
    @Inject(BILLING_CONFIG) private readonly config: BillingConfig,
  ) {}

  async summary(workspaceId: string, actorUserId: string): Promise<BillingSummary> {
    const role = await this.workspaces.requireRole(actorUserId, workspaceId, [...MEMBER_ROLES]);
    const [row, { plan, source, until }, usage] = await Promise.all([
      this.row(workspaceId),
      this.planLimits.planDetails(workspaceId),
      this.planLimits.usage(workspaceId),
    ]);
    return {
      plan,
      source,
      status: row?.status ?? null,
      interval: (row?.interval as BillingInterval | null) ?? null,
      currentPeriodEnd: until?.toISOString() ?? null,
      cancelAtPeriodEnd: row?.cancelAtPeriodEnd ?? false,
      usage,
      limits: plan === "pro" ? null : FREE_LIMITS,
      billingEnabled: this.planLimits.enforced && this.stripe !== null,
      canManage: role === "OWNER" || role === "ADMIN",
    };
  }

  /** Stripe Checkout for Pro. Returns the hosted page to send the user to. */
  async checkout(
    workspaceId: string,
    interval: BillingInterval,
    actorUserId: string,
  ): Promise<{ url: string }> {
    await this.workspaces.requireRole(actorUserId, workspaceId, [...MANAGER_ROLES]);
    const stripe = this.requireStripe();
    const price = this.config.prices[interval];
    if (!price) throw BadRequest(`No Stripe price is configured for the ${interval}ly plan.`);
    if ((await this.planLimits.planOf(workspaceId)) === "pro") {
      throw Conflict("This workspace is already on Pro. Manage it from Plan & billing.");
    }

    const customer = await this.customerFor(workspaceId, actorUserId);
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer,
      client_reference_id: workspaceId,
      line_items: [{ price, quantity: 1 }],
      // The webhook finds the workspace from this.
      subscription_data: { metadata: { workspaceId } },
      allow_promotion_codes: true,
      success_url: `${appUrl()}/workspace/settings?billing=success#billing`,
      cancel_url: `${appUrl()}/workspace/settings#billing`,
    });
    if (!session.url) throw BadRequest("Stripe didn't return a checkout page.");
    return { url: session.url };
  }

  /** Stripe's hosted Billing Portal: invoices, card, switch interval, cancel. */
  async portal(workspaceId: string, actorUserId: string): Promise<{ url: string }> {
    await this.workspaces.requireRole(actorUserId, workspaceId, [...MANAGER_ROLES]);
    const stripe = this.requireStripe();
    const row = await this.row(workspaceId);
    if (!row?.stripeCustomerId) throw BadRequest("This workspace has no billing account yet.");
    const session = await stripe.billingPortal.sessions.create({
      customer: row.stripeCustomerId,
      return_url: `${appUrl()}/workspace/settings#billing`,
    });
    return { url: session.url };
  }

  /** Verifies and applies a Stripe webhook. Unknown events are ignored. */
  async handleWebhook(rawBody: Buffer | string, signature: string | undefined): Promise<void> {
    const stripe = this.requireStripe();
    if (!this.config.webhookSecret || !signature) throw BadRequest("Missing webhook signature.");
    let event: Stripe.Event;
    try {
      event = stripe.webhooks.constructEvent(rawBody, signature, this.config.webhookSecret);
    } catch {
      throw BadRequest("Invalid webhook signature.");
    }

    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object;
        if (typeof session.subscription === "string") {
          await this.syncSubscription(await stripe.subscriptions.retrieve(session.subscription));
        }
        break;
      }
      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.deleted":
        await this.syncSubscription(event.data.object);
        break;
      default:
        break;
    }
  }

  /** Mirrors a Stripe subscription onto its workspace. */
  async syncSubscription(sub: Stripe.Subscription): Promise<void> {
    const customerId = typeof sub.customer === "string" ? sub.customer : sub.customer.id;
    let workspaceId = sub.metadata?.workspaceId;
    if (!workspaceId) {
      const [byCustomer] = await this.db
        .select({ workspaceId: workspaceBilling.workspaceId })
        .from(workspaceBilling)
        .where(eq(workspaceBilling.stripeCustomerId, customerId))
        .limit(1);
      workspaceId = byCustomer?.workspaceId;
    }
    if (!workspaceId) {
      this.logger.warn(`Subscription ${sub.id} has no workspace; ignoring.`);
      return;
    }

    const item = sub.items.data[0];
    // Newer Stripe API versions put the period on the item; older ones on the subscription.
    const periodEnd =
      (item as unknown as { current_period_end?: number } | undefined)?.current_period_end ??
      (sub as unknown as { current_period_end?: number }).current_period_end;
    const values = {
      plan: "pro",
      stripeCustomerId: customerId,
      stripeSubscriptionId: sub.id,
      status: sub.status,
      interval: item?.price.recurring?.interval ?? null,
      currentPeriodEnd: periodEnd ? new Date(periodEnd * 1000) : null,
      cancelAtPeriodEnd: sub.cancel_at_period_end,
      updatedAt: new Date(),
    };
    await this.db
      .insert(workspaceBilling)
      .values({ workspaceId, ...values })
      .onConflictDoUpdate({ target: workspaceBilling.workspaceId, set: values });
  }

  private async customerFor(workspaceId: string, actorUserId: string): Promise<string> {
    const existing = (await this.row(workspaceId))?.stripeCustomerId;
    if (existing) return existing;
    const [user] = await this.db
      .select({ email: users.email, name: users.name })
      .from(users)
      .where(eq(users.id, actorUserId))
      .limit(1);
    const customer = await this.requireStripe().customers.create({
      email: user?.email,
      name: user?.name,
      metadata: { workspaceId },
    });
    await this.db
      .insert(workspaceBilling)
      .values({ workspaceId, stripeCustomerId: customer.id })
      .onConflictDoUpdate({
        target: workspaceBilling.workspaceId,
        set: { stripeCustomerId: customer.id, updatedAt: new Date() },
      });
    return customer.id;
  }

  private async row(workspaceId: string) {
    const [row] = await this.db
      .select()
      .from(workspaceBilling)
      .where(eq(workspaceBilling.workspaceId, workspaceId))
      .limit(1);
    return row ?? null;
  }

  private requireStripe(): Stripe {
    if (!this.stripe) throw BadRequest("Payments aren't set up on this server yet.");
    return this.stripe;
  }
}
