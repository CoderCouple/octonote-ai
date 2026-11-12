import { HttpStatus, Inject, Injectable, Logger } from "@nestjs/common";
import { eq } from "drizzle-orm";
import { AppError } from "../common/error/app-error";
import { ErrorCode } from "../common/error/error-codes";
import { open, seal } from "../common/secret-box";
import { Database, DRIZZLE } from "../db/database.module";
import { userAiKeys } from "../db/schemas";

export interface AiKeyStatus {
  /** Whether this server can store keys at all (AI_KEYS_SECRET is set). */
  available: boolean;
  provider: "anthropic" | null;
  /** The key's last four characters, to recognise it. */
  last4: string | null;
  updatedAt: string | null;
}

/**
 * Bring your own key: a person's Anthropic API key, used for their AI calls
 * instead of the server's (and then without the shared hourly allowance).
 * Encrypted at rest; checked against Anthropic before it's saved.
 */
@Injectable()
export class AiKeysService {
  private readonly log = new Logger(AiKeysService.name);
  /** Decrypted keys, briefly, so a chat's many calls don't each hit the database. */
  private readonly cache = new Map<
    string,
    { key: string | null; at: number }
  >();

  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  private secret(): string | null {
    const s = process.env.AI_KEYS_SECRET?.trim();
    return s && s.length >= 32 ? s : null;
  }

  async status(userId: string): Promise<AiKeyStatus> {
    const [row] = await this.db
      .select()
      .from(userAiKeys)
      .where(eq(userAiKeys.userId, userId));
    return {
      available: !!this.secret(),
      provider: row ? "anthropic" : null,
      last4: row?.last4 ?? null,
      updatedAt: row?.updatedAt.toISOString() ?? null,
    };
  }

  async set(userId: string, rawKey: string): Promise<AiKeyStatus> {
    const secret = this.secret();
    if (!secret)
      throw new AppError(
        ErrorCode.SERVER_ERROR,
        "This server can't store API keys yet.",
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    const apiKey = rawKey.trim();
    if (!/^sk-ant-[A-Za-z0-9_-]{20,}$/.test(apiKey)) {
      throw new AppError(
        ErrorCode.VALIDATION_ERROR,
        "That doesn't look like an Anthropic API key (they start with sk-ant-).",
        HttpStatus.UNPROCESSABLE_ENTITY,
      );
    }
    await this.verify(apiKey);
    const values = {
      ciphertext: seal(apiKey, secret),
      last4: apiKey.slice(-4),
      provider: "anthropic",
      updatedAt: new Date(),
    };
    await this.db
      .insert(userAiKeys)
      .values({ userId, ...values })
      .onConflictDoUpdate({ target: userAiKeys.userId, set: values });
    this.cache.delete(userId);
    return this.status(userId);
  }

  async remove(userId: string): Promise<void> {
    await this.db.delete(userAiKeys).where(eq(userAiKeys.userId, userId));
    this.cache.delete(userId);
  }

  /** The person's own key, or null (no key, or it can't be read with this server's secret). */
  async keyFor(userId: string): Promise<string | null> {
    const hit = this.cache.get(userId);
    if (hit && Date.now() - hit.at < 60_000) return hit.key;
    const secret = this.secret();
    const [row] = secret
      ? await this.db
          .select()
          .from(userAiKeys)
          .where(eq(userAiKeys.userId, userId))
      : [];
    let key: string | null = null;
    if (row && secret) {
      try {
        key = open(row.ciphertext, secret);
      } catch {
        this.log.warn(
          `Couldn't read the AI key of ${userId}; using the server's.`,
        );
      }
    }
    this.cache.set(userId, { key, at: Date.now() });
    return key;
  }

  /** A cheap call that only succeeds with a working key. */
  private async verify(apiKey: string) {
    const { default: Anthropic } = await import("@anthropic-ai/sdk");
    try {
      await new Anthropic({
        apiKey,
        maxRetries: 0,
        timeout: 15_000,
      }).models.list({ limit: 1 });
    } catch (error) {
      const status = (error as { status?: number }).status;
      const message =
        status === 401
          ? "Anthropic didn't accept that key."
          : status === 403
            ? "That key isn't allowed to use the API."
            : "Couldn't reach Anthropic to check the key. Try again in a moment.";
      throw new AppError(
        ErrorCode.VALIDATION_ERROR,
        message,
        HttpStatus.UNPROCESSABLE_ENTITY,
      );
    }
  }
}
