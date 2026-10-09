import { Controller, Get, Param, Query, Req, UseGuards } from "@nestjs/common";
import { z } from "zod";
import {
  SupabaseAuthGuard,
  type AuthenticatedRequest,
} from "../../../auth/supabase-auth.guard";
import { ZodValidationPipe } from "../../../common/zod-validation.pipe";
import type { ResourceKind } from "../../../model/sharing.model";
import {
  AnalyticsService,
  type AnalyticsRange,
} from "../../../service/analytics.service";
import { ResourceKindSchema } from "../request/sharing.request";

const KindParam = new ZodValidationPipe(ResourceKindSchema);
const IdParam = new ZodValidationPipe(z.string().min(1).max(64));
const RangeQuery = new ZodValidationPipe(
  z.enum(["24h", "7d", "30d", "6mo", "1y"]).default("7d"),
);

export interface AnalyticsDto {
  range: AnalyticsRange;
  unit: "hour" | "day" | "week" | "month";
  buckets: { start: string; views: number; visitors: number }[];
  total: number;
  visitors: number;
  previousTotal: number;
  previousVisitors: number;
  allTime: number;
  allTimeVisitors: number;
  lastViewedAt: string | null;
}

/** Published-page view counts, for owners and editors. */
@Controller()
@UseGuards(SupabaseAuthGuard)
export class AnalyticsController {
  constructor(private readonly analytics: AnalyticsService) {}

  @Get(":kind/:id/analytics")
  async get(
    @Param("kind", KindParam) kind: ResourceKind,
    @Param("id", IdParam) id: string,
    @Query("range", RangeQuery) range: AnalyticsRange,
    @Req() req: AuthenticatedRequest,
  ): Promise<AnalyticsDto> {
    const a = await this.analytics.get(req.user.id, kind, id, range);
    return {
      ...a,
      buckets: a.buckets.map((b) => ({
        start: b.start.toISOString(),
        views: b.views,
        visitors: b.visitors,
      })),
      lastViewedAt: a.lastViewedAt ? a.lastViewedAt.toISOString() : null,
    };
  }
}
