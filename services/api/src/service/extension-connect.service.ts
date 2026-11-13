/**
 * Connecting the browser extension (Octonote Clipper) without a token ever
 * touching a web page. PKCE-style:
 *
 *   1. The extension makes a random verifier and sends only its challenge
 *      (base64url(sha256(verifier))) to the connect page in the URL.
 *   2. The page, signed in on the web, mints a one-time code for that
 *      challenge (POST /extension/connect-codes) and hands the code to the
 *      extension with postMessage.
 *   3. The extension trades code + verifier for a clipper-scoped token
 *      (POST /extension/token) — "clipper_read" when the person allowed the
 *      extension to read their notes (the page sent `read: true`). A code works once, for two minutes, and only
 *      with the verifier that matches its challenge, so a code seen by
 *      anything else on the page is useless.
 */
import { HttpStatus, Inject, Injectable } from "@nestjs/common";
import { and, count, eq, gt, gte, isNull, lt } from "drizzle-orm";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { AppError } from "../common/error/app-error";
import { ErrorCode } from "../common/error/error-codes";
import { BadRequest, NotFound } from "../common/error/error-factory";
import { Database, DRIZZLE } from "../db/database.module";
import { WorkspaceMembersRepository } from "../db/repository/workspace-members.repository";
import { extensionConnectCodes, workspaces } from "../db/schemas";
import { CliTokensService } from "./cli-tokens.service";

export type ExtensionTokenScope = "clipper" | "clipper_read";

export const CONNECT_CODE_PREFIX = "onc_";
export const CONNECT_CODE_TTL_MS = 2 * 60_000;
export const EXTENSION_TOKEN_NAME = "Browser extension";
const EXTENSION_TOKEN_DAYS = 365;
/** Codes one person may mint in ten minutes: plenty for retries, not a firehose. */
const MAX_CODES_PER_10_MIN = 20;

/** Every failed exchange says the same thing: nothing to learn from which check failed. */
export const CONNECT_EXPIRED_MESSAGE = "This connect request has expired. Start again from the extension.";

const sha256 = (s: string) => createHash("sha256").update(s).digest();

export function hashConnectCode(code: string) {
  return sha256(code).toString("hex");
}

/** base64url(sha256(verifier)), the S256 PKCE challenge. */
export function challengeFor(verifier: string) {
  return sha256(verifier).toString("base64url");
}

function sameString(a: string, b: string) {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

@Injectable()
export class ExtensionConnectService {
  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly members: WorkspaceMembersRepository,
    private readonly tokens: CliTokensService,
  ) {}

  /** Step 2: the signed-in web page asks for a code for the extension's challenge. */
  async createCode(
    userId: string,
    input: { workspaceId: string; challenge: string; read?: boolean },
  ): Promise<{ code: string; expiresAt: string }> {
    if (!(await this.members.findOne(input.workspaceId, userId))) {
      throw NotFound("That workspace isn't one of yours.");
    }

    const since = new Date(Date.now() - 10 * 60_000);
    const [recent] = await this.db
      .select({ n: count() })
      .from(extensionConnectCodes)
      .where(and(eq(extensionConnectCodes.userId, userId), gte(extensionConnectCodes.createdAt, since)));
    if ((recent?.n ?? 0) >= MAX_CODES_PER_10_MIN) {
      throw new AppError(
        ErrorCode.RATE_LIMITED,
        "Too many connect attempts. Wait a few minutes and try again.",
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    // Old codes are no use to anyone; clear this person's as we go.
    await this.db
      .delete(extensionConnectCodes)
      .where(
        and(
          eq(extensionConnectCodes.userId, userId),
          lt(extensionConnectCodes.expiresAt, new Date(Date.now() - 86_400_000)),
        ),
      );

    const code = `${CONNECT_CODE_PREFIX}${randomBytes(32).toString("base64url")}`;
    const expiresAt = new Date(Date.now() + CONNECT_CODE_TTL_MS);
    await this.db.insert(extensionConnectCodes).values({
      userId,
      workspaceId: input.workspaceId,
      codeHash: hashConnectCode(code),
      challenge: input.challenge,
      scope: input.read ? "clipper_read" : "clipper",
      expiresAt,
    });
    return { code, expiresAt: expiresAt.toISOString() };
  }

  /** Step 3: the extension trades code + verifier for a clipper token. */
  async exchange(input: {
    code: string;
    verifier: string;
  }): Promise<{ token: string; workspaceId: string; workspaceName: string; scope: ExtensionTokenScope }> {
    const expired = () => BadRequest(CONNECT_EXPIRED_MESSAGE, { code: "CONNECT_EXPIRED" });

    // Claim the code first, atomically: of two racing requests only one gets
    // the row back. A wrong verifier still uses the code up.
    const [row] = await this.db
      .update(extensionConnectCodes)
      .set({ usedAt: new Date() })
      .where(
        and(
          eq(extensionConnectCodes.codeHash, hashConnectCode(input.code)),
          isNull(extensionConnectCodes.usedAt),
          gt(extensionConnectCodes.expiresAt, new Date()),
        ),
      )
      .returning();
    if (!row) throw expired();
    if (!sameString(challengeFor(input.verifier), row.challenge)) throw expired();

    // Still a member? (They may have left the workspace in the last two minutes.)
    if (!(await this.members.findOne(row.workspaceId, row.userId))) throw expired();
    const [workspace] = await this.db
      .select({ name: workspaces.name })
      .from(workspaces)
      .where(eq(workspaces.id, row.workspaceId))
      .limit(1);
    if (!workspace) throw expired();

    const { plaintext } = await this.tokens.create(row.userId, {
      name: EXTENSION_TOKEN_NAME,
      expiresInDays: EXTENSION_TOKEN_DAYS,
      scope: row.scope,
    });
    return { token: plaintext, workspaceId: row.workspaceId, workspaceName: workspace.name, scope: row.scope };
  }
}
