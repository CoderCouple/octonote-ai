import type { ModuleRef } from "@nestjs/core";
import { ActivityService, activitySource } from "../common/activity.service";

/**
 * Notes the signed-in caller as active today. Looked up lazily like the CLI
 * token service (AuthModule is built before CoreModule); a no-op where the
 * service isn't registered.
 */
export function recordActivity(
  moduleRef: ModuleRef,
  user: { id: string; cliTokenId?: string },
  headers: Record<string, string | string[] | undefined>,
): void {
  let activity: ActivityService;
  try {
    activity = moduleRef.get(ActivityService, { strict: false });
  } catch {
    return;
  }
  void activity.record(user.id, activitySource(user, headers));
}
