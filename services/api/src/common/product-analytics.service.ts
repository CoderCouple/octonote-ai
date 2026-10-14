import { Inject, Injectable, Logger, Optional } from "@nestjs/common";
import { and, eq } from "drizzle-orm";
import { Database, DRIZZLE } from "../db/database.module";
import { userPreferences } from "../db/schemas/preferences";
import { workspaceMembers } from "../db/schemas/workspaces";

/**
 * Product analytics (PostHog), sent from the API for the steps that matter
 * most — signed up, created, published, shared, upgraded, used a code,
 * connected the CLI — so funnels stay accurate whatever the app or an ad
 * blocker does. Only the user id and a few non-content properties are sent:
 * never names, emails, titles or anything people wrote. Respects the
 * "Help improve Octonote" setting, and does nothing without POSTHOG_KEY.
 */

export interface PostHogConfig {
  key: string | null;
  /** Ingestion host, e.g. https://us.i.posthog.com */
  host: string;
}

export const POSTHOG_CONFIG = Symbol("POSTHOG_CONFIG");
export const POSTHOG_SEND = Symbol("POSTHOG_SEND");

export type PostHogSend = (url: string, body: unknown) => Promise<void>;

const defaultSend: PostHogSend = async (url, body) => {
  await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
};

export type ProductEvent =
  | "signed_up"
  | "workspace_created"
  | "note_created"
  | "canvas_created"
  | "project_created"
  | "notebook_created"
  | "item_published"
  | "item_shared"
  | "checkout_started"
  | "subscription_started"
  | "subscription_cancel_scheduled"
  | "subscription_resumed"
  | "subscription_ended"
  | "subscription_interval_changed"
  | "code_redeemed"
  | "cli_connected";

const OPT_OUT_TTL_MS = 5 * 60_000;

@Injectable()
export class ProductAnalytics {
  private readonly logger = new Logger(ProductAnalytics.name);
  private readonly optedIn = new Map<string, { value: boolean; at: number }>();

  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    @Optional() @Inject(POSTHOG_CONFIG) private readonly config: PostHogConfig | null = null,
    @Optional() @Inject(POSTHOG_SEND) private readonly send: PostHogSend = defaultSend,
  ) {}

  get enabled(): boolean {
    return Boolean(this.config?.key);
  }

  /** Fire-and-forget: never throws, never delays the request. Returns the work for tests. */
  capture(userId: string | null | undefined, event: ProductEvent, properties: Record<string, unknown> = {}): Promise<void> {
    if (!this.enabled || !userId) return Promise.resolve();
    return this.allowed(userId)
      .then((ok) =>
        ok
          ? this.send(`${this.config!.host.replace(/\/$/, "")}/capture/`, {
              api_key: this.config!.key,
              event,
              distinct_id: userId,
              timestamp: new Date().toISOString(),
              properties: { ...properties, $lib: "octonote-api" },
            })
          : undefined,
      )
      .catch((err: unknown) => {
        this.logger.warn(`PostHog ${event} not sent: ${err instanceof Error ? err.message : err}`);
      });
  }

  /** For workspace-level events (billing): sent as the workspace's owner. */
  async captureForWorkspace(workspaceId: string, event: ProductEvent, properties: Record<string, unknown> = {}): Promise<void> {
    if (!this.enabled) return;
    try {
      const [owner] = await this.db
        .select({ userId: workspaceMembers.userId })
        .from(workspaceMembers)
        .where(and(eq(workspaceMembers.workspaceId, workspaceId), eq(workspaceMembers.role, "OWNER")))
        .orderBy(workspaceMembers.createdAt)
        .limit(1);
      await this.capture(owner?.userId, event, properties);
    } catch (err) {
      this.logger.warn(`PostHog ${event} not sent: ${err instanceof Error ? err.message : err}`);
    }
  }

  /** Forget a cached setting (after the person changes it). */
  forget(userId: string): void {
    this.optedIn.delete(userId);
  }

  private async allowed(userId: string): Promise<boolean> {
    const cached = this.optedIn.get(userId);
    if (cached && Date.now() - cached.at < OPT_OUT_TTL_MS) return cached.value;
    const [row] = await this.db
      .select({ analytics: userPreferences.analytics })
      .from(userPreferences)
      .where(eq(userPreferences.userId, userId))
      .limit(1);
    const value = row?.analytics ?? true;
    this.optedIn.set(userId, { value, at: Date.now() });
    return value;
  }
}

/** Reads POSTHOG_KEY / POSTHOG_HOST (US cloud by default). */
export function postHogConfigFromEnv(): PostHogConfig {
  return {
    key: process.env.POSTHOG_KEY?.trim() || null,
    host: process.env.POSTHOG_HOST?.trim() || "https://us.i.posthog.com",
  };
}
