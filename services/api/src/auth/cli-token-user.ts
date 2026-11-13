import type { ModuleRef } from "@nestjs/core";
import type { User } from "@supabase/supabase-js";
import type { CliTokenScope } from "../db/schemas/cli-tokens";
import { CliTokensService, isCliToken } from "../service/cli-tokens.service";

export { isCliToken };

export type CliTokenUser = User & { id: string; cliTokenId: string; cliTokenScope: CliTokenScope };

/**
 * The request user for an `ont_…` CLI token, shaped like a Supabase user so
 * downstream code doesn't care how the caller signed in. `cliTokenId` marks
 * token callers (some actions require a real web session) and `cliTokenScope`
 * what the token may do ("clipper": collections only; "clipper_read": also
 * reading items for the extension). The service is
 * looked up lazily: AuthModule is built before the global CoreModule.
 */
export async function userForCliToken(
  moduleRef: ModuleRef,
  token: string,
): Promise<CliTokenUser | null> {
  const tokens = moduleRef.get(CliTokensService, { strict: false });
  const found = await tokens.verify(token);
  if (!found) return null;
  const { user, tokenId, scope } = found;
  return {
    id: user.id,
    email: user.email,
    aud: "authenticated",
    app_metadata: {},
    user_metadata: { name: user.name },
    created_at: user.createdAt.toISOString(),
    cliTokenId: tokenId,
    cliTokenScope: scope,
  } as CliTokenUser;
}
