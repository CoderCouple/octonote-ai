import { Controller, Get, Query, UseGuards } from "@nestjs/common";
import { ADMIN_METRIC_RANGES, type AdminMetrics } from "@octonote/shared";
import { z } from "zod";
import { AdminGuard } from "../../../auth/admin.guard";
import { SupabaseAuthGuard } from "../../../auth/supabase-auth.guard";
import { ZodValidationPipe } from "../../../common/zod-validation.pipe";
import { AdminMetricsService } from "../../../service/admin-metrics.service";

const DaysQuery = z.object({
  days: z.coerce
    .number()
    .int()
    .refine((d) => (ADMIN_METRIC_RANGES as readonly number[]).includes(d), "days must be 7, 30 or 90")
    .default(30),
});

/** The admin dashboard's numbers. Staff only, web sessions only. */
@Controller("admin/metrics")
@UseGuards(SupabaseAuthGuard, AdminGuard)
export class AdminMetricsController {
  constructor(private readonly metrics: AdminMetricsService) {}

  @Get()
  get(@Query(new ZodValidationPipe(DaysQuery)) query: { days: number }): Promise<AdminMetrics> {
    return this.metrics.metrics(query.days);
  }
}
