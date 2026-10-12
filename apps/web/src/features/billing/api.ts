import type { BillingInterval, BillingSummary } from "@octonote/shared";
import { clientApi } from "@/lib/api/client-fetch";

export function getBillingClientApi(workspaceId: string) {
  return clientApi.get<BillingSummary>(`/workspaces/${workspaceId}/billing`);
}

export function startCheckoutClientApi(
  workspaceId: string,
  interval: BillingInterval,
) {
  return clientApi.post<{ url: string }>(
    `/workspaces/${workspaceId}/billing/checkout`,
    {
      interval,
    },
  );
}

export function openBillingPortalClientApi(workspaceId: string) {
  return clientApi.post<{ url: string }>(
    `/workspaces/${workspaceId}/billing/portal`,
  );
}
