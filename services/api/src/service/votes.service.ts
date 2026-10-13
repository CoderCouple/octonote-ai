/**
 * Up/down votes on published content. Anyone can see the counts; voting
 * needs a signed-in reader, one vote each (+1 / -1), changeable or
 * removable. Only items readable under the published slug can be voted on.
 */
import { Inject, Injectable } from "@nestjs/common";
import { and, eq, sql } from "drizzle-orm";
import { Unauthorized } from "../common/error/error-factory";
import { Database, DRIZZLE } from "../db/database.module";
import { resourceVotes } from "../db/schemas/votes";
import type { ResourceKind } from "../model/sharing.model";
import { PublicService } from "./public.service";

export type VoteValue = 1 | -1 | 0;

export interface VoteSummary {
  up: number;
  down: number;
  /** The signed-in reader's vote; 0 when none (or signed out). */
  mine: VoteValue;
}

@Injectable()
export class VotesService {
  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly publicService: PublicService,
  ) {}

  async summary(
    slug: string,
    kind: ResourceKind,
    id: string,
    userId: string | null,
  ): Promise<VoteSummary> {
    await this.publicService.assertReadable(slug, kind, id);
    return this.counts(kind, id, userId);
  }

  /** value 1 = upvote, -1 = downvote, 0 = remove your vote. */
  async vote(
    slug: string,
    kind: ResourceKind,
    id: string,
    userId: string | null,
    value: VoteValue,
  ): Promise<VoteSummary> {
    if (!userId) throw Unauthorized("Sign in to vote.");
    await this.publicService.assertReadable(slug, kind, id);
    const mineWhere = and(
      eq(resourceVotes.resourceKind, kind),
      eq(resourceVotes.resourceId, id),
      eq(resourceVotes.userId, userId),
    );
    if (value === 0) {
      await this.db.delete(resourceVotes).where(mineWhere);
    } else {
      await this.db
        .insert(resourceVotes)
        .values({ resourceKind: kind, resourceId: id, userId, value })
        .onConflictDoUpdate({
          target: [resourceVotes.resourceKind, resourceVotes.resourceId, resourceVotes.userId],
          set: { value, updatedAt: new Date() },
        });
    }
    return this.counts(kind, id, userId);
  }

  private async counts(kind: ResourceKind, id: string, userId: string | null): Promise<VoteSummary> {
    const [row] = await this.db
      .select({
        up: sql<number>`count(*) filter (where ${resourceVotes.value} = 1)`,
        down: sql<number>`count(*) filter (where ${resourceVotes.value} = -1)`,
        mine: userId
          ? sql<number>`coalesce(max(${resourceVotes.value}) filter (where ${resourceVotes.userId} = ${userId}), 0)`
          : sql<number>`0`,
      })
      .from(resourceVotes)
      .where(and(eq(resourceVotes.resourceKind, kind), eq(resourceVotes.resourceId, id)));
    return {
      up: Number(row?.up ?? 0),
      down: Number(row?.down ?? 0),
      mine: Number(row?.mine ?? 0) as VoteValue,
    };
  }
}
