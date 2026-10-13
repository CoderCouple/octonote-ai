/**
 * CLI / agent tokens: create (plaintext returned once), list, revoke, and
 * verify — the auth guards call verify() for `ont_…` bearer tokens.
 */
import { Injectable } from "@nestjs/common";
import { createHash, randomBytes } from "node:crypto";
import { NotFound } from "../common/error/error-factory";
import { CliTokensRepository } from "../db/repository/cli-tokens.repository";
import { UsersRepository } from "../db/repository/users.repository";

export const CLI_TOKEN_PREFIX = "ont_";

export interface CliTokenDto {
  id: string;
  name: string;
  /** "ont_…abcd" — never the token itself. */
  preview: string;
  lastUsedAt: string | null;
  expiresAt: string | null;
  createdAt: string;
}

export function hashCliToken(plaintext: string) {
  return createHash("sha256").update(plaintext).digest("hex");
}

export function isCliToken(token: string) {
  return token.startsWith(CLI_TOKEN_PREFIX);
}

type Row = Awaited<ReturnType<CliTokensRepository["findActiveByHash"]>> & {};

function toDto(row: Row): CliTokenDto {
  return {
    id: row.id,
    name: row.name,
    preview: `${CLI_TOKEN_PREFIX}…${row.tokenPreview}`,
    lastUsedAt: row.lastUsedAt?.toISOString() ?? null,
    expiresAt: row.expiresAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}

@Injectable()
export class CliTokensService {
  constructor(
    private readonly repo: CliTokensRepository,
    private readonly usersRepo: UsersRepository,
  ) {}

  async list(userId: string): Promise<CliTokenDto[]> {
    return (await this.repo.listForUser(userId)).map(toDto);
  }

  async create(
    userId: string,
    input: { name: string; expiresInDays?: number },
  ): Promise<{ token: CliTokenDto; plaintext: string }> {
    const plaintext = `${CLI_TOKEN_PREFIX}${randomBytes(32).toString("base64url")}`;
    const row = await this.repo.insert({
      userId,
      name: input.name.trim().slice(0, 80) || "CLI",
      tokenHash: hashCliToken(plaintext),
      tokenPreview: plaintext.slice(-4),
      expiresAt: input.expiresInDays
        ? new Date(Date.now() + input.expiresInDays * 86_400_000)
        : null,
    });
    return { token: toDto(row), plaintext };
  }

  async revoke(id: string, userId: string): Promise<CliTokenDto> {
    const row = await this.repo.findById(id);
    // Someone else's token is "not found", not "forbidden": don't confirm it exists.
    if (!row || row.userId !== userId) throw NotFound("Token not found.");
    if (row.revokedAt) return toDto(row);
    return toDto((await this.repo.revoke(id))!);
  }

  /**
   * The user a bearer `ont_…` token belongs to, or null if it's unknown,
   * revoked or expired. Records the use.
   */
  async verify(plaintext: string) {
    const row = await this.repo.findActiveByHash(hashCliToken(plaintext));
    if (!row) return null;
    if (row.expiresAt && row.expiresAt.getTime() <= Date.now()) return null;
    const user = await this.usersRepo.findById(row.userId);
    if (!user) return null;
    void this.repo.recordUse(row.id).catch(() => undefined);
    return { user, tokenId: row.id };
  }
}
