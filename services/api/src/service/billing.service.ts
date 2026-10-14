/**
 * Plan & billing for a workspace, backed by Stripe: hosted Checkout to
 * upgrade (with an Octonote-checked promo code), and in-app invoices,
 * cancel / resume and monthly ⇄ yearly switching (the hosted Billing Portal
 * stays available for the card). Stripe is the
 * source of truth; its webhook mirrors subscription state into
 * `workspace_billing`, which PlanLimitsService reads.
 *
 * Env: STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, STRIPE_PRICE_PRO_MONTH,
 * STRIPE_PRICE_PRO_YEAR, PUBLIC_APP_URL (redirects). Without the secret key
 * billing reports `billingEnabled: false` and limits aren't enforced.
 */
import { Inject, Injectable, Logger, Optional } from "@nestjs/common";
import {
  FREE_LIMITS,
  PRO_PRICE,
  type BillingInterval,
  type BillingInvoice,
  type BillingSummary,
} from "@octonote/shared";
import { eq } from "drizzle-orm";
import type Stripe from "stripe";
import { BadRequest, Conflict } from "../common/error/error-factory";
import { PlanLimitsService } from "../common/plan-limits.service";
import { ProductAnalytics, type ProductEvent } from "../common/product-analytics.service";
import { Database, DRIZZLE } from "../db/database.module";
import { workspaceBilling } from "../db/schemas/billing";
import { billingEvents } from "../db/schemas/tracking";
import { users } from "../db/schemas/users";
import { appUrl } from "./lib/resource-url";
import { PromotionsService } from "./promotions.service";
import { WorkspacesService } from "./workspaces.service";

import { STRIPE_CLIENT } from "./stripe.tokens";
export { STRIPE_CLIENT };

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
    private readonly promotions: PromotionsService,
    @Optional() private readonly analytics: ProductAnalytics | null = null,
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
      promo: await this.promotions.activeFor(workspaceId, row?.stripeSubscriptionId ?? null),
      prices: { month: PRO_PRICE.month * 100, year: PRO_PRICE.year * 100 },
    };
  }

  /** Stripe Checkout for Pro. Returns the hosted page to send the user to. */
  async checkout(
    workspaceId: string,
    interval: BillingInterval,
    actorUserId: string,
    code?: string,
  ): Promise<{ url: string }> {
    await this.workspaces.requireRole(actorUserId, workspaceId, [...MANAGER_ROLES]);
    const stripe = this.requireStripe();
    const price = this.config.prices[interval];
    if (!price) throw BadRequest(`No Stripe price is configured for the ${interval}ly plan.`);
    if ((await this.planLimits.planOf(workspaceId)) === "pro") {
      throw Conflict("This workspace is already on Pro. Manage it from Plan & billing.");
    }

    // Codes are checked by Octonote (personal codes, one per workspace…), so
    // Stripe's own code box stays off and a valid code's coupon is applied here.
    const discount = code ? await this.promotions.discountForCheckout(workspaceId, code, actorUserId) : null;
    const customer = await this.customerFor(workspaceId, actorUserId);
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer,
      client_reference_id: workspaceId,
      line_items: [{ price, quantity: 1 }],
      // The webhook finds the workspace from this.
      subscription_data: { metadata: { workspaceId } },
      ...(discount
        ? {
            discounts: [{ coupon: discount.stripeCouponId }],
            metadata: { workspaceId, promoCodeId: discount.promoCodeId, userId: actorUserId },
          }
        : {}),
      success_url: `${appUrl()}/workspace/settings?billing=success#billing`,
      cancel_url: `${appUrl()}/workspace/settings#billing`,
    });
    if (!session.url) throw BadRequest("Stripe didn't return a checkout page.");
    void this.analytics?.capture(actorUserId, "checkout_started", { interval, withCode: Boolean(discount) });
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
        const promoCodeId = session.metadata?.promoCodeId;
        const workspaceId = session.metadata?.workspaceId ?? session.client_reference_id;
        if (promoCodeId && workspaceId) {
          await this.promotions.recordDiscount(
            promoCodeId,
            workspaceId,
            session.metadata?.userId ?? null,
            typeof session.subscription === "string" ? session.subscription : null,
          );
        }
        break;
      }
      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.deleted":
        await this.syncSubscription(event.data.object);
        break;
      case "invoice.payment_failed": {
        const invoice = event.data.object;
        const customerId = typeof invoice.customer === "string" ? invoice.customer : invoice.customer?.id;
        const workspaceId = customerId ? await this.workspaceForCustomer(customerId) : undefined;
        if (workspaceId) {
          await this.db
            .insert(billingEvents)
            .values({ workspaceId, kind: "payment_failed", amountCents: invoice.amount_due, stripeEventId: event.id })
            .onConflictDoNothing();
        }
        break;
      }
      default:
        break;
    }
  }

  /** Past invoices for the Billing page (newest first): owners and admins. */
  async invoices(workspaceId: string, actorUserId: string): Promise<BillingInvoice[]> {
    await this.workspaces.requireRole(actorUserId, workspaceId, [...MANAGER_ROLES]);
    const customer = (await this.row(workspaceId))?.stripeCustomerId;
    if (!customer || !this.stripe) return [];
    const list = await this.stripe.invoices.list({ customer, limit: 24 });
    return list.data.map((inv) => ({
      id: inv.id ?? "",
      number: inv.number ?? null,
      date: new Date(inv.created * 1000).toISOString(),
      total: inv.total,
      currency: inv.currency,
      status: inv.status ?? null,
      url: inv.hosted_invoice_url ?? null,
      pdfUrl: inv.invoice_pdf ?? null,
    }));
  }

  /** Cancel at the end of the paid period (`resume` undoes it until then). */
  async setCancelAtPeriodEnd(workspaceId: string, cancel: boolean, actorUserId: string): Promise<BillingSummary> {
    await this.workspaces.requireRole(actorUserId, workspaceId, [...MANAGER_ROLES]);
    const subId = await this.requireSubscription(workspaceId);
    await this.syncSubscription(
      await this.requireStripe().subscriptions.update(subId, { cancel_at_period_end: cancel }),
    );
    return this.summary(workspaceId, actorUserId);
  }

  /**
   * Switch between monthly and yearly. Stripe prorates: moving to yearly
   * charges the difference now; moving to monthly credits the unused time.
   */
  async changeInterval(workspaceId: string, interval: BillingInterval, actorUserId: string): Promise<BillingSummary> {
    await this.workspaces.requireRole(actorUserId, workspaceId, [...MANAGER_ROLES]);
    const price = this.config.prices[interval];
    if (!price) throw BadRequest(`No Stripe price is configured for the ${interval}ly plan.`);
    const subId = await this.requireSubscription(workspaceId);
    const stripe = this.requireStripe();
    const sub = await stripe.subscriptions.retrieve(subId);
    const item = sub.items.data[0];
    if (!item) throw BadRequest("This subscription has no plan to change.");
    if (item.price.id === price) throw Conflict(`This workspace is already billed ${interval}ly.`);
    await this.syncSubscription(
      await stripe.subscriptions.update(subId, {
        items: [{ id: item.id, price }],
        proration_behavior: "always_invoice",
        // Switching plans also takes back a pending cancellation.
        cancel_at_period_end: false,
      }),
    );
    return this.summary(workspaceId, actorUserId);
  }

  /**
   * Admin only (the portal): ends the subscription now instead of at the
   * period's end, optionally refunding its last payment in full. Customers
   * cancel at the period's end from their Billing page.
   */
  async cancelNow(workspaceId: string, refundLastPayment: boolean): Promise<{ refundedCents: number }> {
    const subId = await this.requireSubscription(workspaceId);
    const stripe = this.requireStripe();
    let refundedCents = 0;
    if (refundLastPayment) {
      const sub = await stripe.subscriptions.retrieve(subId);
      const invoiceId = typeof sub.latest_invoice === "string" ? sub.latest_invoice : sub.latest_invoice?.id;
      const invoice = invoiceId ? await stripe.invoices.retrieve(invoiceId) : null;
      const paymentIntent = (invoice as unknown as { payment_intent?: string | { id: string } | null } | null)?.payment_intent;
      const intentId = typeof paymentIntent === "string" ? paymentIntent : paymentIntent?.id;
      if (invoice && intentId && invoice.amount_paid > 0) {
        const refund = await stripe.refunds.create({ payment_intent: intentId });
        refundedCents = refund.amount;
      }
    }
    await this.syncSubscription(await stripe.subscriptions.cancel(subId));
    return { refundedCents };
  }

  private async requireSubscription(workspaceId: string): Promise<string> {
    const subId = (await this.row(workspaceId))?.stripeSubscriptionId;
    if (!subId) throw BadRequest("This workspace has no subscription to change.");
    return subId;
  }

  /** Mirrors a Stripe subscription onto its workspace. */
  async syncSubscription(sub: Stripe.Subscription): Promise<void> {
    const customerId = typeof sub.customer === "string" ? sub.customer : sub.customer.id;
    const workspaceId = sub.metadata?.workspaceId ?? (await this.workspaceForCustomer(customerId));
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
    const before = await this.row(workspaceId);
    await this.db
      .insert(workspaceBilling)
      .values({ workspaceId, ...values })
      .onConflictDoUpdate({ target: workspaceBilling.workspaceId, set: values });
    const events = billingChanges(before, values);
    if (events.length) {
      await this.db.insert(billingEvents).values(
        events.map((kind) => ({ workspaceId, kind, interval: values.interval, stripeSubscriptionId: sub.id })),
      );
      for (const kind of events) {
        const event = SUBSCRIPTION_EVENTS[kind];
        if (event) void this.analytics?.captureForWorkspace(workspaceId, event, { interval: values.interval });
      }
    }
  }

  private async workspaceForCustomer(customerId: string): Promise<string | undefined> {
    const [row] = await this.db
      .select({ workspaceId: workspaceBilling.workspaceId })
      .from(workspaceBilling)
      .where(eq(workspaceBilling.stripeCustomerId, customerId))
      .limit(1);
    return row?.workspaceId;
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

type BillingEventKind = "started" | "cancel_scheduled" | "resumed" | "ended" | "interval_changed" | "past_due";

const SUBSCRIPTION_EVENTS: Partial<Record<BillingEventKind, ProductEvent>> = {
  started: "subscription_started",
  cancel_scheduled: "subscription_cancel_scheduled",
  resumed: "subscription_resumed",
  ended: "subscription_ended",
  interval_changed: "subscription_interval_changed",
};

const LIVE = new Set(["active", "trialing", "past_due"]);

/**
 * What changed between the stored subscription and Stripe's latest copy, as
 * history entries. Comparing against the stored row (rather than trusting the
 * event type) makes this idempotent: our own API calls and Stripe's webhook
 * retries sync the same state twice, and the second sync finds no change.
 */
export function billingChanges(
  before: { stripeSubscriptionId: string | null; status: string | null; interval: string | null; cancelAtPeriodEnd: boolean } | null,
  after: { stripeSubscriptionId: string; status: string; interval: string | null; cancelAtPeriodEnd: boolean },
): BillingEventKind[] {
  const wasLive = Boolean(before?.stripeSubscriptionId === after.stripeSubscriptionId && before.status && LIVE.has(before.status));
  const isLive = LIVE.has(after.status);
  if (!wasLive) return isLive ? ["started"] : [];
  if (!isLive) return after.status === "canceled" || after.status === "unpaid" || after.status === "incomplete_expired" ? ["ended"] : [];
  const out: BillingEventKind[] = [];
  if (before!.interval && after.interval && before!.interval !== after.interval) out.push("interval_changed");
  if (!before!.cancelAtPeriodEnd && after.cancelAtPeriodEnd) out.push("cancel_scheduled");
  if (before!.cancelAtPeriodEnd && !after.cancelAtPeriodEnd) out.push("resumed");
  if (before!.status !== "past_due" && after.status === "past_due") out.push("past_due");
  return out;
}
