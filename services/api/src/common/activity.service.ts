import { Inject, Injectable, Logger } from "@nestjs/common";
import { Database, DRIZZLE } from "../db/database.module";
import { activityDays } from "../db/schemas/tracking";

export type ActivitySource = "web" | "mobile" | "cli";

/** Header the web and mobile apps send so the API can tell them apart. */
export const CLIENT_HEADER = "x-octonote-client";

/** Where a signed-in request came from: a CLI token, the mobile app, or the web. */
export function activitySource(
  user: { cliTokenId?: string },
  headers: Record<string, string | string[] | undefined>,
): ActivitySource {
  if (user.cliTokenId) return "cli";
  return headers[CLIENT_HEADER] === "mobile" ? "mobile" : "web";
}

/**
 * Records that a user was active today (per source), for the admin
 * dashboard's active-user counts. Called by the auth guards on every signed-in
 * request, so it writes at most once per user, day and source per process and
 * never slows down or fails a request.
 */
@Injectable()
export class ActivityService {
  private readonly logger = new Logger(ActivityService.name);
  private day = "";
  private seen = new Set<string>();

  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  /** Fire-and-forget; returns the write for tests. */
  record(userId: string, source: ActivitySource, now = new Date()): Promise<void> {
    const day = now.toISOString().slice(0, 10);
    if (day !== this.day) {
      this.day = day;
      this.seen.clear();
    }
    const key = `${userId}|${source}`;
    if (this.seen.has(key)) return Promise.resolve();
    this.seen.add(key);
    return this.db
      .insert(activityDays)
      .values({ userId, day, source })
      .onConflictDoNothing()
      .then(() => undefined)
      .catch((err: unknown) => {
        // Allow a retry on the next request (e.g. the user row isn't there yet).
        this.seen.delete(key);
        this.logger.warn(`Couldn't record activity: ${err instanceof Error ? err.message : err}`);
      });
  }
}
