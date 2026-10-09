import { clientApi } from "@/lib/api/client-fetch";
import type { ResourceKind } from "@/features/sharing";

export type AnalyticsRange = "24h" | "7d" | "30d" | "6mo" | "1y";
export type BucketUnit = "hour" | "day" | "week" | "month";

export interface Analytics {
  range: AnalyticsRange;
  unit: BucketUnit;
  buckets: { start: string; views: number; visitors: number }[];
  total: number;
  visitors: number;
  previousTotal: number;
  previousVisitors: number;
  allTime: number;
  allTimeVisitors: number;
  lastViewedAt: string | null;
}

export function getAnalyticsApi(
  kind: ResourceKind,
  id: string,
  range: AnalyticsRange,
) {
  return clientApi.get<Analytics>(`/${kind}/${id}/analytics?range=${range}`);
}

export const analyticsKeys = {
  one: (kind: ResourceKind, id: string, range: AnalyticsRange) =>
    ["analytics", kind, id, range] as const,
};
