/**
 * Real-Postgres test harness: PGlite (in-process, WASM) with the actual
 * migration applied, and the real services wired by hand. Only email is
 * faked, so tests can assert what was sent.
 */
import "reflect-metadata";
import { readdirSync, readFileSync } from "fs";
import { join } from "path";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { buildIdFromUuid } from "@octonote/shared";
import { ChangeEventsService } from "../../src/common/change-events.service";
import type { CrmMail, CrmMailer, InboundEvent, ReceivedMail } from "../../src/common/crm-mailer";
import type { EmailService, ShareEmailInput } from "../../src/common/email.service";
import { SupportAccessService } from "../../src/service/support-access.service";
import { NoteCommentsService } from "../../src/service/note-comments.service";
import { PermissionsService } from "../../src/common/permissions.service";
import { PlanLimitsService } from "../../src/common/plan-limits.service";
import { BillingService } from "../../src/service/billing.service";
import type { Database } from "../../src/db/database.module";
import { CanvasesRepository } from "../../src/db/repository/canvases.repository";
import { NotebooksRepository } from "../../src/db/repository/notebooks.repository";
import { PagesRepository } from "../../src/db/repository/pages.repository";
import { ProjectsRepository } from "../../src/db/repository/projects.repository";
import { SharingRepository } from "../../src/db/repository/sharing.repository";
import { UserPreferencesRepository } from "../../src/db/repository/user-preferences.repository";
import { WorkspaceMembersRepository } from "../../src/db/repository/workspace-members.repository";
import { WorkspacesRepository } from "../../src/db/repository/workspaces.repository";
import { UsersRepository } from "../../src/db/repository/users.repository";
import { CliTokensRepository } from "../../src/db/repository/cli-tokens.repository";
import { CliTokensService } from "../../src/service/cli-tokens.service";
import { OAuthRepository } from "../../src/db/repository/oauth.repository";
import { OAuthService } from "../../src/service/oauth.service";
import { NoteMarkdownService } from "../../src/service/note-markdown.service";
import { AdminCrmService } from "../../src/service/admin-crm.service";
import { PartnersService } from "../../src/service/partners.service";
import { PromotionsService } from "../../src/service/promotions.service";
import { ActivityService } from "../../src/common/activity.service";
import { ProductAnalytics } from "../../src/common/product-analytics.service";
import { AdminMetricsService } from "../../src/service/admin-metrics.service";
import { AdminTrafficService } from "../../src/service/admin-traffic.service";
import { AdminExploreService } from "../../src/service/admin-explore.service";
import { AdminAuditService } from "../../src/common/admin-audit.service";
import { AdminService } from "../../src/service/admin.service";
import { CanvasDiagramService } from "../../src/service/canvas-diagram.service";
import * as schema from "../../src/db/schema";
import { CanvasesService } from "../../src/service/canvases.service";
import { ChangeEventsReaderService } from "../../src/service/change-events-reader.service";
import { ChangeEventsRepository } from "../../src/db/repository/change-events.repository";
import { AnalyticsService } from "../../src/service/analytics.service";
import { ViewsRepository } from "../../src/db/repository/views.repository";
import { NotebookPlacement } from "../../src/service/lib/notebook-placement";
import { MeService } from "../../src/service/me.service";
import { VotesService } from "../../src/service/votes.service";
import { FiguresService } from "../../src/service/figures.service";
import { AccountService } from "../../src/service/account.service";
import { PreferencesService } from "../../src/service/preferences.service";
import { NotebooksService } from "../../src/service/notebooks.service";
import { PagesService } from "../../src/service/pages.service";
import { ProjectsService } from "../../src/service/projects.service";
import { PublicService } from "../../src/service/public.service";
import { SharesService } from "../../src/service/shares.service";
import { SharingSettingsService } from "../../src/service/sharing-settings.service";
import { WorkspacesService } from "../../src/service/workspaces.service";

const MIGRATIONS_DIR = join(__dirname, "../../drizzle");

export class FakeEmail {
  sent: ShareEmailInput[] = [];
  failNext = false;
  async sendShareNotification(input: ShareEmailInput): Promise<void> {
    if (this.failNext) {
      this.failNext = false;
      throw new Error("smtp down");
    }
    this.sent.push(input);
  }
}

/**
 * Stands in for Resend in Admin → Inbox: records what would be sent and
 * forwarded, and plays back received emails. A webhook "signature" of
 * "valid" passes; anything else is refused.
 */
export class FakeCrmMailer implements CrmMailer {
  readonly fromAddress = "hello@octonote.ai";
  readonly bcc: string | null = "hello@octonote.ai";
  replyDomain: string | null = "reply.octonote.ai";
  sent: CrmMail[] = [];
  forwarded: string[] = [];
  received: Record<string, ReceivedMail> = {};
  failNext = false;
  async send(mail: CrmMail) {
    if (this.failNext) {
      this.failNext = false;
      throw new Error("resend down");
    }
    this.sent.push(mail);
    return { id: `re_${this.sent.length}` };
  }
  verifyInbound(rawBody: string, headers: { id?: string; timestamp?: string; signature?: string }): InboundEvent {
    if (headers.signature !== "valid") throw new Error("bad signature");
    const e = JSON.parse(rawBody) as { type: string; data: { email_id: string; from: string; to: string[] } };
    return { type: e.type, emailId: e.data.email_id, from: e.data.from, to: e.data.to };
  }
  async getReceived(emailId: string): Promise<ReceivedMail> {
    const r = this.received[emailId];
    if (!r) throw new Error("not found");
    return r;
  }
  async forwardToTeam(emailId: string) {
    this.forwarded.push(emailId);
  }
}

/** Records Supabase admin calls made by account deletion. */
export class FakeSupabase {
  deletedUsers: string[] = [];
  links: string[] = [];
  removedObjects: string[] = [];
  failDeleteUser = false;
  auth = {
    admin: {
      generateLink: async ({ email }: { email: string }) => {
        this.links.push(email);
        return { data: { properties: { hashed_token: `hash_for_${email}` } }, error: null };
      },
      deleteUser: async (id: string) => {
        if (this.failDeleteUser) return { error: new Error("auth down") };
        this.deletedUsers.push(id);
        return { error: null };
      },
    },
  };
  uploads = new Map<string, { bytes: Buffer; options: Record<string, unknown> }>();
  storage = {
    from: (bucket: string) => ({
      remove: async (paths: string[]) => {
        this.removedObjects.push(...paths);
        return { error: null };
      },
      upload: async (path: string, bytes: Buffer, options: Record<string, unknown>) => {
        this.uploads.set(`${bucket}/${path}`, { bytes, options });
        return { error: null };
      },
      getPublicUrl: (path: string) => ({
        data: { publicUrl: `https://storage.test/${bucket}/${path}` },
      }),
    }),
  };
}

/**
 * Just enough of the Stripe SDK for billing tests. Webhook "signatures" are
 * the literal string "valid"; the payload is the JSON event.
 */
export class FakeStripe {
  customers = { create: async () => ({ id: "cus_test" }) };
  checkout = {
    sessions: {
      create: async (params: Record<string, unknown>) => {
        this.lastCheckout = params;
        return { url: "https://checkout.stripe.test/session" };
      },
    },
  };
  billingPortal = {
    sessions: { create: async () => ({ url: "https://billing.stripe.test/portal" }) },
  };
  subscriptions = {
    retrieve: async (id: string) => this.subscriptionsById[id],
    update: async (id: string, params: Record<string, unknown>) => {
      this.lastSubscriptionUpdate = { id, params };
      const sub = this.subscriptionsById[id] as Record<string, any>;
      if ("cancel_at_period_end" in params) sub.cancel_at_period_end = params.cancel_at_period_end;
      const items = params.items as { price: string }[] | undefined;
      if (items?.[0]) {
        const interval = items[0].price === "price_year" ? "year" : "month";
        sub.items.data[0] = { ...sub.items.data[0], price: { id: items[0].price, recurring: { interval } } };
      }
      return sub;
    },
    cancel: async (id: string) => {
      const sub = this.subscriptionsById[id] as Record<string, any>;
      sub.status = "canceled";
      this.cancelled.push(id);
      return sub;
    },
  };
  refunds = {
    create: async (params: { payment_intent: string }) => {
      this.refunded.push(params.payment_intent);
      return { id: "re_1", amount: 500 };
    },
  };
  cancelled: string[] = [];
  refunded: string[] = [];
  coupons = {
    create: async (params: Record<string, unknown>) => {
      this.couponsCreated.push(params);
      return { id: `coupon_${this.couponsCreated.length}` };
    },
  };
  invoices = {
    retrieve: async (id: string) => ({ id, amount_paid: 500, payment_intent: `pi_for_${id}` }),
    list: async () => ({
      data: [
        {
          id: "in_1",
          number: "OCT-0001",
          created: 1_760_000_000,
          total: 600,
          currency: "usd",
          status: "paid",
          hosted_invoice_url: "https://invoice.stripe.test/in_1",
          invoice_pdf: "https://invoice.stripe.test/in_1.pdf",
        },
      ],
    }),
  };
  couponsCreated: Record<string, unknown>[] = [];
  lastSubscriptionUpdate: { id: string; params: Record<string, unknown> } | null = null;
  webhooks = {
    constructEvent: (body: Buffer | string, signature: string) => {
      if (signature !== "valid") throw new Error("bad signature");
      return JSON.parse(body.toString());
    },
  };
  lastCheckout: Record<string, unknown> | null = null;
  subscriptionsById: Record<string, unknown> = {};
}

export async function createHarness() {
  const pg = new PGlite();
  const migrations = readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith(".sql")).sort();
  for (const file of migrations) {
    const sql = readFileSync(join(MIGRATIONS_DIR, file), "utf8");
    for (const stmt of sql.split("--> statement-breakpoint")) {
      if (stmt.trim()) await pg.exec(stmt);
    }
  }
  const db = drizzle(pg, { schema }) as unknown as Database;

  const pagesRepo = new PagesRepository(db);
  const canvasesRepo = new CanvasesRepository(db);
  const projectsRepo = new ProjectsRepository(db);
  const notebooksRepo = new NotebooksRepository(db);
  const sharingRepo = new SharingRepository(db);
  const workspacesRepo = new WorkspacesRepository(db);
  const membersRepo = new WorkspaceMembersRepository(db);

  const email = new FakeEmail();
  const supabase = new FakeSupabase();
  const stripe = new FakeStripe();
  // PostHog with a fake transport: tests read `posthog.sent`.
  const posthog = { sent: [] as { event: string; distinct_id: string; properties: Record<string, unknown> }[] };
  const productAnalytics = new ProductAnalytics(db, { key: "phc_test", host: "https://ph.test" }, async (_url, body) => {
    posthog.sent.push(body as (typeof posthog.sent)[number]);
  });
  const changeEvents = new ChangeEventsService(db, productAnalytics);
  const permissions = new PermissionsService(db);
  const placement = new NotebookPlacement(permissions);
  // Limits on, as in production once Stripe is configured.
  const planLimits = new PlanLimitsService(db, true);
  const workspaces = new WorkspacesService(db, workspacesRepo, membersRepo, changeEvents, planLimits);
  const promotions = new PromotionsService(db, planLimits, workspaces, stripe as never, productAnalytics);
  const adminAudit = new AdminAuditService(db);
  const partners = new PartnersService(db, promotions, planLimits, adminAudit);

  const services = {
    cliTokens: new CliTokensService(new CliTokensRepository(db), new UsersRepository(db), productAnalytics),
    oauth: new OAuthService(new OAuthRepository(db), new UsersRepository(db), productAnalytics),
    permissions,
    workspaces,
    pages: new PagesService(pagesRepo, permissions, placement, workspaces, changeEvents, planLimits),
    canvases: new CanvasesService(
      canvasesRepo,
      permissions,
      placement,
      workspaces,
      changeEvents,
      planLimits,
    ),
    projects: new ProjectsService(
      projectsRepo,
      pagesRepo,
      canvasesRepo,
      permissions,
      placement,
      workspaces,
      changeEvents,
      planLimits,
    ),
    notebooks: new NotebooksService(
      notebooksRepo,
      pagesRepo,
      canvasesRepo,
      projectsRepo,
      permissions,
      workspaces,
      changeEvents,
      planLimits,
    ),
    shares: new SharesService(
      sharingRepo,
      permissions,
      email as unknown as EmailService,
      changeEvents,
      new UserPreferencesRepository(db),
    ),
    settings: new SharingSettingsService(sharingRepo, permissions, changeEvents),
    public: new PublicService(
      sharingRepo,
      pagesRepo,
      canvasesRepo,
      projectsRepo,
      notebooksRepo,
      new UsersRepository(db),
    ),
    me: new MeService(db, productAnalytics),
    get votes() {
      return new VotesService(db, this.public);
    },
    figures: new FiguresService(db, permissions, workspaces, supabase as never),
    planLimits,
    promotions,
    billing: new BillingService(
      db,
      planLimits,
      workspaces,
      stripe as never,
      { webhookSecret: "whsec_test", prices: { month: "price_month", year: "price_year" } },
      promotions,
      productAnalytics,
      partners,
    ),
    account: new AccountService(db, supabase as never),
    preferences: new PreferencesService(new UserPreferencesRepository(db), productAnalytics),
    recent: new ChangeEventsReaderService(new ChangeEventsRepository(db), workspaces),
    analytics: new AnalyticsService(new ViewsRepository(db), permissions),
  };

  let seq = 0;
  /** Signs a user in through MeService exactly as the app does (creates their workspace). */
  async function signIn(emailAddr: string) {
    seq += 1;
    const uuid = `00000000-0000-4000-8000-${String(seq).padStart(12, "0")}`;
    const me = await services.me.sync({
      id: buildIdFromUuid("usr", uuid),
      email: emailAddr,
      user_metadata: { name: emailAddr.split("@")[0] },
      app_metadata: {},
      aud: "authenticated",
      created_at: new Date().toISOString(),
    } as never);
    return {
      id: me.user.id,
      email: emailAddr,
      name: me.user.name,
      workspaceId: me.memberships[0]!.workspace.id,
    };
  }

  const activity = new ActivityService(db);
  const adminMetrics = new AdminMetricsService(db);
  const adminTraffic = new AdminTrafficService(db);
  const adminExplore = new AdminExploreService(db, adminTraffic);
  const crmMailer = new FakeCrmMailer();
  const crm = new AdminCrmService(db, planLimits, adminAudit, crmMailer);
  const admin = new AdminService(db, supabase as never, planLimits, services.billing, adminAudit);
  const support = new SupportAccessService(db, adminAudit);
  const noteComments = new NoteCommentsService(db, services.pages, permissions);
  const noteMarkdown = new NoteMarkdownService(services.pages);
  const canvasDiagrams = new CanvasDiagramService(services.canvases);
  return { pg, db, email, support, noteComments, supabase, stripe, signIn, noteMarkdown, canvasDiagrams, activity, adminMetrics, adminTraffic, adminExplore, adminAudit, admin, partners, crm, crmMailer, productAnalytics, posthog, ...services };
}

export type Harness = Awaited<ReturnType<typeof createHarness>>;

/** Resolves to the HTTP status a rejected promise carries (Nest or AppError). */
export async function statusOf(p: Promise<unknown>): Promise<number> {
  try {
    await p;
  } catch (err) {
    const e = err as { getStatus?: () => number; status?: number };
    return e.getStatus?.() ?? e.status ?? 500;
  }
  return 200;
}
