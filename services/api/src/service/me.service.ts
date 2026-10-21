/**
 * "Who am I?" sync. Runs on every dashboard load. Side-effects:
 *
 *   - upserts the user row (Supabase JWT → users)
 *   - converts pending share invites for this email into active grants
 *   - if the user has zero memberships, bootstraps a personal workspace
 *     (and seeds them as OWNER)
 *
 * Wraps the work in a single Drizzle transaction so partial failures don't
 * leave inconsistent membership state. This service has direct DB access
 * (rather than going through repositories) for that atomicity — we'd need
 * tx-aware repos to do this cleanly any other way.
 */
import type { User as SupabaseUser } from "@supabase/supabase-js";
import { Inject, Injectable, Optional } from "@nestjs/common";
import { and, eq, inArray, sql } from "drizzle-orm";
import { emailDomainSuffixes, STUDENT_PRO_MONTHS } from "@octonote/shared";
import { attributeToPartner, partnerForRef } from "../common/partner-attribution";
import { BadRequest } from "../common/error/error-factory";
import { ProductAnalytics } from "../common/product-analytics.service";
import { Database, DRIZZLE } from "../db/database.module";
import { studentEmailSuffixes } from "../db/schemas/billing";
import { users } from "../db/schemas/users";
import { resourceShares } from "../db/schemas/sharing";
import { workspaceMembers, workspaces } from "../db/schemas/workspaces";
import { toUser, type User } from "../model/user.model";
import {
  toWorkspace,
  toWorkspaceMember,
  type Workspace,
  type WorkspaceMember,
} from "../model/workspace.model";

function slugify(input: string): string {
  return (
    input
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 30) || "workspace"
  );
}

interface MeResult {
  user: User;
  memberships: Array<{ membership: WorkspaceMember; workspace: Workspace }>;
}

/** Whether the email's domain ends with a whitelisted suffix (student_email_suffixes). */
async function isStudentEmail(
  db: Pick<Database, "select">,
  email: string,
): Promise<boolean> {
  const candidates = emailDomainSuffixes(email);
  if (candidates.length === 0) return false;
  const hit = await db
    .select({ suffix: studentEmailSuffixes.suffix })
    .from(studentEmailSuffixes)
    .where(
      and(
        inArray(studentEmailSuffixes.suffix, candidates),
        eq(studentEmailSuffixes.enabled, true),
      ),
    )
    .limit(1);
  return hit.length > 0;
}

/** "pub:my-page-x7q2"-style sign-up sources only; anything else is dropped. */
export function cleanSignupRef(ref: string | null | undefined): string | null {
  return ref && /^[a-z0-9_-]{1,80}(:[a-z0-9_-]{1,80})?$/.test(ref) ? ref : null;
}

/** The placeholder name a new account gets when its sign-in has no name. */
export function emailLocalPart(email: string): string {
  return email.split("@")[0] ?? email;
}

@Injectable()
export class MeService {
  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    @Optional() private readonly analytics: ProductAnalytics | null = null,
  ) {}

  async sync(
    supabaseUser: SupabaseUser & { id: string },
    opts: { signupRef?: string | null } = {},
  ): Promise<MeResult> {
    const email = supabaseUser.email;
    if (!email) throw BadRequest("Supabase user has no email.");

    const meta = supabaseUser.user_metadata ?? {};
    const emailName = emailLocalPart(email);
    const name =
      (meta.full_name as string | undefined) ??
      (meta.name as string | undefined) ??
      emailName;
    const avatarUrl = (meta.avatar_url as string | undefined) ?? null;

    let isNew = false;
    let student = false;
    const result = await this.db.transaction(async (tx) => {
      const [userRow] = await tx
        .insert(users)
        .values({ id: supabaseUser.id, email, name, avatarUrl })
        .onConflictDoUpdate({
          target: users.id,
          // Keep a name the user chose in Settings; only fill in a real
          // provider name over the email-derived placeholder.
          set: {
            email,
            name: sql`case when ${users.name} = ${emailName} then excluded.name else ${users.name} end`,
            avatarUrl,
            updatedAt: new Date(),
          },
        })
        .returning();
      if (!userRow) throw BadRequest("Failed to upsert user.");
      // A brand-new row has created_at == updated_at (an upsert bumps updated_at).
      isNew = userRow.createdAt.getTime() === userRow.updatedAt.getTime();

      // Where a brand-new account came from (sent by the web app; see
      // apps/web/src/features/public/lib/signup-ref.ts). First sign-in only.
      const signupRef = cleanSignupRef(opts.signupRef);
      if (isNew && signupRef && !userRow.signupRef) {
        await tx
          .update(users)
          .set({ signupRef })
          .where(eq(users.id, userRow.id));
        userRow.signupRef = signupRef;
        // A creator's link (?ref=priya) makes this person theirs.
        const partner = await partnerForRef(tx, signupRef);
        if (partner) await attributeToPartner(tx, userRow.id, partner.id, "link");
      }

      // Students (.edu and friends) get Pro free for a year from their first
      // sign-in with that email. Set once; never extended.
      if (!userRow.studentProUntil && (await isStudentEmail(tx, email))) {
        const until = new Date();
        until.setMonth(until.getMonth() + STUDENT_PRO_MONTHS);
        await tx
          .update(users)
          .set({ studentProUntil: until })
          .where(eq(users.id, userRow.id));
        userRow.studentProUntil = until;
      }
      student = Boolean(userRow.studentProUntil);

      // Pending share invites sent to this email become active grants.
      // Supabase verifies email ownership before issuing a session, so the
      // JWT email is trusted here.
      await tx
        .update(resourceShares)
        .set({
          grantedToUserId: userRow.id,
          grantedToEmail: null,
          status: "active",
          acceptedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(resourceShares.grantedToEmail, email.toLowerCase()),
            eq(resourceShares.status, "pending"),
          ),
        );

      let memberships = await tx
        .select({ membership: workspaceMembers, workspace: workspaces })
        .from(workspaceMembers)
        .innerJoin(workspaces, eq(workspaceMembers.workspaceId, workspaces.id))
        .where(eq(workspaceMembers.userId, userRow.id));

      if (memberships.length === 0) {
        const localPart = email.split("@")[0] ?? "user";
        const slug = `${slugify(localPart)}-${userRow.id.slice(0, 6)}`;
        const workspaceName = `${name}'s workspace`;
        const [workspace] = await tx
          .insert(workspaces)
          .values({ name: workspaceName, slug })
          .returning();
        if (!workspace) throw BadRequest("Failed to bootstrap workspace.");
        const [membership] = await tx
          .insert(workspaceMembers)
          .values({
            workspaceId: workspace.id,
            userId: userRow.id,
            role: "OWNER",
          })
          .returning();
        if (!membership) throw BadRequest("Failed to seed owner membership.");
        memberships = [{ membership, workspace }];
      }

      return {
        user: toUser(userRow),
        memberships: memberships.map((m) => ({
          membership: toWorkspaceMember(m.membership),
          workspace: toWorkspace(m.workspace),
        })),
      };
    });
    if (isNew) {
      void this.analytics?.capture(result.user.id, "signed_up", { student });
    }
    return result;
  }

  /** Settings → Account: the name shown everywhere, including published bylines. */
  async updateName(userId: string, name: string): Promise<User> {
    const clean = name.trim().replace(/\s+/g, " ");
    if (clean.length < 1 || clean.length > 80)
      throw BadRequest("Names are 1–80 characters.");
    const [row] = await this.db
      .update(users)
      .set({ name: clean, updatedAt: new Date() })
      .where(eq(users.id, userId))
      .returning();
    if (!row) throw BadRequest("Account not found.");
    return toUser(row);
  }
}
