/**
 * Promo codes: free Pro periods granted by Octonote, and discounts applied
 * through Stripe. Every code is checked here — Stripe Checkout's own code box
 * is off — so the rules hold for both kinds:
 *   - the code exists, is switched on and hasn't expired or run out;
 *   - a personal code is used by the email it was made for;
 *   - a workspace uses each code once, and one free code ever;
 *   - a free code can't start while the workspace already pays.
 * Free redemptions lock the code row, so the last use can't be taken twice.
 */
import { Inject, Injectable } from "@nestjs/common";
import {
  describePromo,
  type PromoApplyResult,
  type PromoCodeCreate,
  type PromoCodeDto,
  type PromoDuration,
  type PromoKind,
  type PromoRedemptionDto,
} from "@octonote/shared";
import { and, desc, eq, gt, sql } from "drizzle-orm";
import type Stripe from "stripe";
import { BadRequest, Conflict, NotFound } from "../common/error/error-factory";
import { PlanLimitsService } from "../common/plan-limits.service";
import { Database, DRIZZLE } from "../db/database.module";
import { promoCodes, promoRedemptions } from "../db/schemas/promotions";
import { users } from "../db/schemas/users";
import { workspaces } from "../db/schemas/workspaces";
import { STRIPE_CLIENT } from "./stripe.tokens";
import { WorkspacesService } from "./workspaces.service";

type CodeRow = typeof promoCodes.$inferSelect;
const MANAGER_ROLES = ["OWNER", "ADMIN"] as const;

/** A refused code: 400 with a stable `code` the UI and CLI can branch on. */
const refuse = (code: string, message: string) => BadRequest(message, { code });

export function describeCode(row: CodeRow): string {
  return describePromo({
    kind: row.kind as PromoKind,
    percentOff: row.percentOff,
    amountOffCents: row.amountOffCents,
    duration: row.duration as PromoDuration | null,
    durationMonths: row.durationMonths,
    freeMonths: row.freeMonths,
  });
}

function addMonths(from: Date, months: number) {
  const d = new Date(from);
  d.setUTCMonth(d.getUTCMonth() + months);
  return d;
}

@Injectable()
export class PromotionsService {
  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly planLimits: PlanLimitsService,
    private readonly workspaces: WorkspacesService,
    @Inject(STRIPE_CLIENT) private readonly stripe: Stripe | null,
  ) {}

  // --- Using a code ----------------------------------------------------------

  /**
   * Enter a code in Plan & billing. A free code is redeemed now; a discount
   * is checked and returned, to be applied by checkout().
   */
  async apply(workspaceId: string, code: string, actorUserId: string): Promise<PromoApplyResult> {
    await this.workspaces.requireRole(actorUserId, workspaceId, [...MANAGER_ROLES]);
    const row = await this.find(code);
    if (row?.kind === "free_pro") return this.redeemFree(workspaceId, row.code, actorUserId);
    const checked = await this.check(row, workspaceId, actorUserId);
    return { kind: checked.kind as "percent_off" | "amount_off", code: checked.code, description: describeCode(checked) };
  }

  /** For checkout(): the Stripe coupon behind a valid discount code. */
  async discountForCheckout(workspaceId: string, code: string, actorUserId: string) {
    const row = await this.check(await this.find(code), workspaceId, actorUserId);
    if (row.kind === "free_pro") throw refuse("PROMO_NOT_A_DISCOUNT", "That code gives free Pro — enter it under “Have a code?” instead.");
    if (!row.stripeCouponId) throw refuse("PROMO_INVALID", "That code isn't set up for payments yet.");
    return { promoCodeId: row.id, stripeCouponId: row.stripeCouponId };
  }

  private async redeemFree(workspaceId: string, code: string, actorUserId: string): Promise<PromoApplyResult> {
    // Checked before the transaction: everything inside it must use `tx`.
    if ((await this.planLimits.planDetails(workspaceId)).source === "stripe") {
      throw refuse("PROMO_ALREADY_PAYING", "This workspace already pays for Pro, so a free code can't be added.");
    }
    return this.db.transaction(async (tx) => {
      // Lock the code row: the uses check and the increment can't interleave.
      const [row] = await tx.select().from(promoCodes).where(eq(promoCodes.code, code)).for("update").limit(1);
      const checked = await this.check(row ?? null, workspaceId, actorUserId, tx as unknown as Database);
      const proUntil = addMonths(new Date(), checked.freeMonths!);
      await tx.insert(promoRedemptions).values({
        promoCodeId: checked.id,
        workspaceId,
        userId: actorUserId,
        kind: "free_pro",
        proUntil,
      });
      await tx
        .update(promoCodes)
        .set({ redemptionCount: sql`${promoCodes.redemptionCount} + 1`, updatedAt: new Date() })
        .where(eq(promoCodes.id, checked.id));
      return { kind: "free_pro", code: checked.code, description: describeCode(checked), proUntil: proUntil.toISOString() };
    });
  }

  /** Called from the Stripe webhook once a discounted checkout completes. */
  async recordDiscount(promoCodeId: string, workspaceId: string, userId: string | null, subscriptionId: string | null) {
    await this.db.transaction(async (tx) => {
      const [code] = await tx.select().from(promoCodes).where(eq(promoCodes.id, promoCodeId)).for("update").limit(1);
      if (!code) return;
      const inserted = await tx
        .insert(promoRedemptions)
        .values({ promoCodeId, workspaceId, userId, kind: code.kind, stripeSubscriptionId: subscriptionId })
        .onConflictDoNothing()
        .returning({ id: promoRedemptions.id });
      // Webhooks can repeat: count each workspace once, and never past the cap.
      if (inserted.length && (code.maxRedemptions === null || code.redemptionCount < code.maxRedemptions)) {
        await tx
          .update(promoCodes)
          .set({ redemptionCount: sql`${promoCodes.redemptionCount} + 1`, updatedAt: new Date() })
          .where(eq(promoCodes.id, promoCodeId));
      }
    });
  }

  /** The code shown on the Billing page: the free code in force, or the subscription's discount. */
  async activeFor(workspaceId: string, subscriptionId: string | null) {
    const [free] = await this.db
      .select({ code: promoCodes })
      .from(promoRedemptions)
      .innerJoin(promoCodes, eq(promoCodes.id, promoRedemptions.promoCodeId))
      .where(
        and(
          eq(promoRedemptions.workspaceId, workspaceId),
          eq(promoRedemptions.kind, "free_pro"),
          gt(promoRedemptions.proUntil, new Date()),
        ),
      )
      .limit(1);
    let row = free?.code ?? null;
    if (!row && subscriptionId) {
      const [paid] = await this.db
        .select({ code: promoCodes })
        .from(promoRedemptions)
        .innerJoin(promoCodes, eq(promoCodes.id, promoRedemptions.promoCodeId))
        .where(and(eq(promoRedemptions.workspaceId, workspaceId), eq(promoRedemptions.stripeSubscriptionId, subscriptionId)))
        .limit(1);
      row = paid?.code ?? null;
    }
    return row ? { code: row.code, kind: row.kind as PromoKind, description: describeCode(row) } : null;
  }

  private async find(code: string): Promise<CodeRow | null> {
    const [row] = await this.db
      .select()
      .from(promoCodes)
      .where(eq(promoCodes.code, code.trim().toUpperCase()))
      .limit(1);
    return row ?? null;
  }

  /** The rules every use goes through. Returns the code when it may be used. */
  private async check(row: CodeRow | null, workspaceId: string, actorUserId: string, db: Database = this.db): Promise<CodeRow> {
    // Unknown and switched-off codes look the same: don't confirm a code exists.
    if (!row || !row.enabled) throw refuse("PROMO_INVALID", "That code isn't valid.");
    if (row.expiresAt && row.expiresAt.getTime() <= Date.now()) throw refuse("PROMO_EXPIRED", "That code has expired.");
    if (row.maxRedemptions !== null && row.redemptionCount >= row.maxRedemptions) {
      throw refuse("PROMO_USED_UP", "That code has been used up.");
    }
    if (row.assignedEmail) {
      const [me] = await db.select({ email: users.email }).from(users).where(eq(users.id, actorUserId)).limit(1);
      if (me?.email.toLowerCase() !== row.assignedEmail) {
        throw refuse("PROMO_NOT_YOURS", "That code was made for someone else.");
      }
    }
    const used = await db
      .select({ kind: promoRedemptions.kind, promoCodeId: promoRedemptions.promoCodeId })
      .from(promoRedemptions)
      .where(eq(promoRedemptions.workspaceId, workspaceId));
    if (used.some((u) => u.promoCodeId === row.id)) {
      throw refuse("PROMO_ALREADY_USED", "This workspace has already used that code.");
    }
    if (row.kind === "free_pro" && used.some((u) => u.kind === "free_pro")) {
      throw refuse("PROMO_ONE_FREE", "This workspace has already used a free code — one per workspace.");
    }
    return row;
  }

  // --- Admin -----------------------------------------------------------------

  async create(input: PromoCodeCreate, adminUserId: string): Promise<PromoCodeDto> {
    if (await this.find(input.code)) throw Conflict(`A code called ${input.code} already exists.`);
    const discount = input.kind !== "free_pro";
    let stripeCouponId: string | null = null;
    if (discount) {
      if (!this.stripe) throw BadRequest("Discount codes need payments set up (Stripe keys on the API).");
      const coupon = await this.stripe.coupons.create({
        name: input.code,
        ...(input.kind === "percent_off"
          ? { percent_off: input.percentOff }
          : { amount_off: input.amountOffCents, currency: "usd" }),
        duration: input.duration!,
        ...(input.duration === "repeating" ? { duration_in_months: input.durationMonths } : {}),
        // Mirrors the code's limits, as a backstop on Stripe's side.
        ...(input.maxRedemptions ? { max_redemptions: input.maxRedemptions } : {}),
        ...(input.expiresAt ? { redeem_by: Math.floor(new Date(input.expiresAt).getTime() / 1000) } : {}),
        metadata: { octonoteCode: input.code },
      });
      stripeCouponId = coupon.id;
    }
    const [row] = await this.db
      .insert(promoCodes)
      .values({
        code: input.code,
        kind: input.kind,
        audience: input.audience,
        percentOff: input.kind === "percent_off" ? input.percentOff : null,
        amountOffCents: input.kind === "amount_off" ? input.amountOffCents : null,
        duration: discount ? input.duration : null,
        durationMonths: discount && input.duration === "repeating" ? input.durationMonths : null,
        freeMonths: input.kind === "free_pro" ? input.freeMonths : null,
        maxRedemptions: input.maxRedemptions ?? null,
        expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
        assignedEmail: input.assignedEmail ?? null,
        note: input.note ?? null,
        stripeCouponId,
        createdByUserId: adminUserId,
      })
      .returning();
    return toDto(row!);
  }

  async list(): Promise<PromoCodeDto[]> {
    return (await this.db.select().from(promoCodes).orderBy(desc(promoCodes.createdAt))).map(toDto);
  }

  async setEnabled(id: string, enabled: boolean): Promise<PromoCodeDto> {
    const [row] = await this.db
      .update(promoCodes)
      .set({ enabled, updatedAt: new Date() })
      .where(eq(promoCodes.id, id))
      .returning();
    if (!row) throw NotFound("Code not found.");
    return toDto(row);
  }

  async redemptions(id: string): Promise<PromoRedemptionDto[]> {
    const rows = await this.db
      .select({ r: promoRedemptions, w: { id: workspaces.id, name: workspaces.name }, u: { id: users.id, name: users.name, email: users.email } })
      .from(promoRedemptions)
      .leftJoin(workspaces, eq(workspaces.id, promoRedemptions.workspaceId))
      .leftJoin(users, eq(users.id, promoRedemptions.userId))
      .where(eq(promoRedemptions.promoCodeId, id))
      .orderBy(desc(promoRedemptions.createdAt));
    return rows.map(({ r, w, u }) => ({
      id: r.id,
      workspace: w?.id ? w : null,
      user: u?.id ? u : null,
      proUntil: r.proUntil?.toISOString() ?? null,
      stripeSubscriptionId: r.stripeSubscriptionId,
      createdAt: r.createdAt.toISOString(),
    }));
  }
}

function toDto(row: CodeRow): PromoCodeDto {
  return {
    id: row.id,
    code: row.code,
    kind: row.kind as PromoKind,
    audience: row.audience as PromoCodeDto["audience"],
    description: describeCode(row),
    percentOff: row.percentOff,
    amountOffCents: row.amountOffCents,
    duration: row.duration as PromoDuration | null,
    durationMonths: row.durationMonths,
    freeMonths: row.freeMonths,
    maxRedemptions: row.maxRedemptions,
    redemptionCount: row.redemptionCount,
    expiresAt: row.expiresAt?.toISOString() ?? null,
    enabled: row.enabled,
    assignedEmail: row.assignedEmail,
    note: row.note,
    createdAt: row.createdAt.toISOString(),
  };
}
