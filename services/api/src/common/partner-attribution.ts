/**
 * Who brought a person to Octonote. Shared by sign-up (the partner's link,
 * remembered in a cookie as `?ref=priya`) and promo codes (their code). The
 * first partner wins and is never replaced.
 */
import { and, eq } from "drizzle-orm";
import type { Database } from "../db/database.module";
import { partnerReferrals, partners } from "../db/schemas/partners";

/** The partner a sign-up ref points at: "priya", or "priya:some-page". Enabled partners only. */
export async function partnerForRef(db: Pick<Database, "select">, ref: string | null | undefined) {
  const code = (ref ?? "").split(":")[0]!.trim().toUpperCase();
  if (!/^[A-Z0-9][A-Z0-9_-]{2,39}$/.test(code)) return null;
  const [row] = await db
    .select({ id: partners.id })
    .from(partners)
    .where(and(eq(partners.code, code), eq(partners.enabled, true)))
    .limit(1);
  return row ?? null;
}

/** Records the partner for this person unless one is already recorded. True when it did. */
export async function attributeToPartner(
  db: Pick<Database, "insert">,
  userId: string,
  partnerId: string,
  via: "link" | "code",
): Promise<boolean> {
  const inserted = await db
    .insert(partnerReferrals)
    .values({ userId, partnerId, via })
    .onConflictDoNothing()
    .returning({ userId: partnerReferrals.userId });
  return inserted.length > 0;
}

/** The partner whose promo code this is, if it belongs to an enabled one. */
export async function partnerForPromoCode(db: Pick<Database, "select">, promoCodeId: string) {
  const [row] = await db
    .select({ id: partners.id })
    .from(partners)
    .where(and(eq(partners.promoCodeId, promoCodeId), eq(partners.enabled, true)))
    .limit(1);
  return row ?? null;
}

