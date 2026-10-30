import { Body, Controller, Get, HttpCode, Post, Query, UseGuards } from "@nestjs/common";
import { ADMIN_METRIC_RANGES, type AdminMetrics, type AdminTraffic, type ExploreQuery, type ExploreResult } from "@octonote/shared";
import { z } from "zod";
import { AdminGuard } from "../../../auth/admin.guard";
import { SupabaseAuthGuard } from "../../../auth/supabase-auth.guard";
import { ZodValidationPipe } from "../../../common/zod-validation.pipe";
import { AdminExploreService } from "../../../service/admin-explore.service";
import { AdminMetricsService } from "../../../service/admin-metrics.service";
import { AdminTrafficService } from "../../../service/admin-traffic.service";

const DaysQuery = z.object({
  days: z.coerce
    .number()
    .int()
    .refine((d) => (ADMIN_METRIC_RANGES as readonly number[]).includes(d), "days must be 7, 30 or 90")
    .default(30),
  /** "1" leaves staff out (admins, @octonote.ai, STAFF_EMAILS). */
  excludeStaff: z.preprocess((v) => v === "1" || v === "true", z.boolean()),
});
type RangeQuery = { days: number; excludeStaff: boolean };

/** Shape only; the service checks every name against EXPLORE_DATASETS. */
const ExploreBody = z.object({
  dataset: z.string().max(40),
  measure: z.string().max(40),
  groupBy: z.string().max(40),
  splitBy: z.string().max(40).nullable().optional(),
  granularity: z.enum(["day", "week", "month"]),
  days: z.number().int(),
  excludeStaff: z.boolean(),
  filters: z.array(z.object({ dim: z.string().max(40), op: z.enum(["eq", "neq"]), value: z.string().max(300) })).max(8),
}) as unknown as z.ZodType<ExploreQuery>;

/** The admin dashboard's numbers. Staff only, web sessions only. */
@Controller("admin")
@UseGuards(SupabaseAuthGuard, AdminGuard)
export class AdminMetricsController {
  constructor(
    private readonly metrics: AdminMetricsService,
    private readonly traffic: AdminTrafficService,
    private readonly exploreService: AdminExploreService,
  ) {}

  @Get("metrics")
  get(@Query(new ZodValidationPipe(DaysQuery)) query: RangeQuery): Promise<AdminMetrics> {
    return this.metrics.metrics(query.days, new Date(), query.excludeStaff);
  }

  /** Explore: one measure grouped, split and filtered (slice, dice, drill down, roll up). */
  @Post("explore")
  @HttpCode(200)
  explore(@Body(new ZodValidationPipe(ExploreBody)) body: ExploreQuery): Promise<ExploreResult> {
    return this.exploreService.explore(body);
  }

  /** Website traffic from PostHog (read server-side). */
  @Get("traffic")
  getTraffic(@Query(new ZodValidationPipe(DaysQuery)) query: RangeQuery): Promise<AdminTraffic> {
    return this.traffic.traffic(query.days, query.excludeStaff);
  }
}
