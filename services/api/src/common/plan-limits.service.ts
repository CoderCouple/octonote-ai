/**
 * Free-plan limits: what a workspace is on, how much it uses, and the check
 * every create path runs. Lives in CoreModule (DB only, no Stripe) so the
 * pages/canvases/projects/notebooks/workspaces services can all use it.
 *
 * Limits are only enforced once payments are set up (`STRIPE_SECRET_KEY`):
 * blocking people who have no way to upgrade would just strand them.
 */
import { Inject, Injectable } from "@nestjs/common";
import {
  FREE_LIMITS,
  FREE_OWNED_WORKSPACES,
  type LimitedKind,
  type Plan,
} from "@octonote/shared";
import { and, count, eq, gt, inArray, isNull, max } from "drizzle-orm";
import { Database, DRIZZLE } from "../db/database.module";
import { workspaceBilling } from "../db/schemas/billing";
import { canvases } from "../db/schemas/canvases";
import { notebooks } from "../db/schemas/notebooks";
import { pages } from "../db/schemas/pages";
import { projects } from "../db/schemas/projects";
import { users } from "../db/schemas/users";
import { workspaceMembers } from "../db/schemas/workspaces";
import { PlanLimit } from "./error/error-factory";

/** Stripe statuses that keep Pro on (past_due gets a grace period while Stripe retries). */
const PAID_STATUSES = ["active", "trialing", "past_due"];

const NOUN: Record<LimitedKind, string> = {
  page: "notes",
  canvas: "canvases",
  project: "projects",
  notebook: "notebooks",
};

export const BILLING_ENFORCED = Symbol("BILLING_ENFORCED");

@Injectable()
export class PlanLimitsService {
  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    @Inject(BILLING_ENFORCED) readonly enforced: boolean,
  ) {}

  async planOf(workspaceId: string): Promise<Plan> {
    return (await this.planDetails(workspaceId)).plan;
  }

  /**
   * Pro comes from an active Stripe subscription on the workspace, or from
   * an owner's free student year. `until` is when that runs out (if known).
   */
  async planDetails(
    workspaceId: string,
    now = new Date(),
  ): Promise<{ plan: Plan; source: "stripe" | "student" | null; until: Date | null }> {
    const [row] = await this.db
      .select({
        plan: workspaceBilling.plan,
        status: workspaceBilling.status,
        periodEnd: workspaceBilling.currentPeriodEnd,
      })
      .from(workspaceBilling)
      .where(eq(workspaceBilling.workspaceId, workspaceId))
      .limit(1);
    if (row?.plan === "pro" && PAID_STATUSES.includes(row.status ?? "")) {
      return { plan: "pro", source: "stripe", until: row.periodEnd };
    }
    const [student] = await this.db
      .select({ until: max(users.studentProUntil) })
      .from(workspaceMembers)
      .innerJoin(users, eq(users.id, workspaceMembers.userId))
      .where(
        and(
          eq(workspaceMembers.workspaceId, workspaceId),
          eq(workspaceMembers.role, "OWNER"),
          gt(users.studentProUntil, now),
        ),
      );
    if (student?.until) return { plan: "pro", source: "student", until: new Date(student.until) };
    return { plan: "free", source: null, until: null };
  }

  /**
   * Live items per kind. A project counts once — its own note and canvas
   * don't count as notes/canvases; deleted or archived items don't count.
   */
  async usage(workspaceId: string): Promise<Record<LimitedKind, number>> {
    const n = async (q: Promise<{ n: number }[]>) => Number((await q)[0]?.n ?? 0);
    const [page, canvas, project, notebook] = await Promise.all([
      n(
        this.db
          .select({ n: count() })
          .from(pages)
          .where(
            and(eq(pages.workspaceId, workspaceId), isNull(pages.projectId), isNull(pages.deletedAt)),
          ),
      ),
      n(
        this.db
          .select({ n: count() })
          .from(canvases)
          .where(
            and(
              eq(canvases.workspaceId, workspaceId),
              isNull(canvases.projectId),
              isNull(canvases.deletedAt),
            ),
          ),
      ),
      n(
        this.db
          .select({ n: count() })
          .from(projects)
          .where(and(eq(projects.workspaceId, workspaceId), isNull(projects.archivedAt))),
      ),
      n(this.db.select({ n: count() }).from(notebooks).where(eq(notebooks.workspaceId, workspaceId))),
    ]);
    return { page, canvas, project, notebook };
  }

  /** Throws 402 PLAN_LIMIT when a free workspace already has its 10 of `kind`. */
  async assertCanCreate(workspaceId: string, kind: LimitedKind): Promise<void> {
    if (!this.enforced) return;
    if ((await this.planOf(workspaceId)) === "pro") return;
    const used = (await this.usage(workspaceId))[kind];
    const limit = FREE_LIMITS[kind];
    if (used >= limit) {
      throw PlanLimit(
        `You've used all ${limit} free ${NOUN[kind]} in this workspace. Upgrade to Pro for unlimited ${NOUN[kind]}.`,
        { kind, limit, used, workspaceId },
      );
    }
  }

  /** Free users own one workspace; owning any Pro workspace lifts that. */
  async assertCanCreateWorkspace(userId: string): Promise<void> {
    if (!this.enforced) return;
    const [me] = await this.db
      .select({ studentProUntil: users.studentProUntil })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    if (me?.studentProUntil && me.studentProUntil > new Date()) return;
    const owned = await this.db
      .select({ workspaceId: workspaceMembers.workspaceId })
      .from(workspaceMembers)
      .where(and(eq(workspaceMembers.userId, userId), eq(workspaceMembers.role, "OWNER")));
    if (owned.length < FREE_OWNED_WORKSPACES) return;
    const paid = await this.db
      .select({ workspaceId: workspaceBilling.workspaceId })
      .from(workspaceBilling)
      .where(
        and(
          inArray(
            workspaceBilling.workspaceId,
            owned.map((o) => o.workspaceId),
          ),
          eq(workspaceBilling.plan, "pro"),
          inArray(workspaceBilling.status, PAID_STATUSES),
        ),
      )
      .limit(1);
    if (paid.length === 0) {
      throw PlanLimit(
        "The Free plan includes one workspace. Upgrade to Pro to create more.",
        { kind: "workspace", limit: FREE_OWNED_WORKSPACES, used: owned.length },
      );
    }
  }
}
