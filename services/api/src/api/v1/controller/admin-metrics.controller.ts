import { Controller, Get, Query, UseGuards } from "@nestjs/common";
import { ADMIN_METRIC_RANGES, type AdminMetrics, type AdminTraffic } from "@octonote/shared";
import { z } from "zod";
import { AdminGuard } from "../../../auth/admin.guard";
import { SupabaseAuthGuard } from "../../../auth/supabase-auth.guard";
import { ZodValidationPipe } from "../../../common/zod-validation.pipe";
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

/** The admin dashboard's numbers. Staff only, web sessions only. */
@Controller("admin")
@UseGuards(SupabaseAuthGuard, AdminGuard)
export class AdminMetricsController {
  constructor(
    private readonly metrics: AdminMetricsService,
    private readonly traffic: AdminTrafficService,
  ) {}

  @Get("metrics")
  get(@Query(new ZodValidationPipe(DaysQuery)) query: RangeQuery): Promise<AdminMetrics> {
    return this.metrics.metrics(query.days, new Date(), query.excludeStaff);
  }

  /** Website traffic from PostHog (read server-side). */
  @Get("traffic")
  getTraffic(@Query(new ZodValidationPipe(DaysQuery)) query: RangeQuery): Promise<AdminTraffic> {
    return this.traffic.traffic(query.days, query.excludeStaff);
  }
}
