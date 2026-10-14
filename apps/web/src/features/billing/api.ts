import type {
  BillingInterval,
  BillingInvoice,
  BillingSummary,
  PromoApplyResult,
  PromoCodeCreate,
  PromoCodeDto,
  PromoRedemptionDto,
} from "@octonote/shared";
import { clientApi } from "@/lib/api/client-fetch";

const base = (workspaceId: string) => `/workspaces/${workspaceId}/billing`;

export function getBillingClientApi(workspaceId: string) {
  return clientApi.get<BillingSummary>(base(workspaceId));
}

/** Stripe Checkout for Pro; `code` is a discount code already checked with applyCodeClientApi. */
export function startCheckoutClientApi(
  workspaceId: string,
  interval: BillingInterval,
  code?: string,
) {
  return clientApi.post<{ url: string }>(`${base(workspaceId)}/checkout`, {
    interval,
    ...(code ? { code } : {}),
  });
}

export function openBillingPortalClientApi(workspaceId: string) {
  return clientApi.post<{ url: string }>(`${base(workspaceId)}/portal`);
}

/** "Have a code?": a free code is redeemed now; a discount is checked for checkout. */
export function applyCodeClientApi(workspaceId: string, code: string) {
  return clientApi.post<PromoApplyResult>(`${base(workspaceId)}/code`, {
    code,
  });
}

export function listInvoicesClientApi(workspaceId: string) {
  return clientApi.get<BillingInvoice[]>(`${base(workspaceId)}/invoices`);
}

export function cancelSubscriptionClientApi(workspaceId: string) {
  return clientApi.post<BillingSummary>(`${base(workspaceId)}/cancel`);
}

export function resumeSubscriptionClientApi(workspaceId: string) {
  return clientApi.post<BillingSummary>(`${base(workspaceId)}/resume`);
}

export function changeIntervalClientApi(
  workspaceId: string,
  interval: BillingInterval,
) {
  return clientApi.post<BillingSummary>(`${base(workspaceId)}/interval`, {
    interval,
  });
}

// --- Admin: promo codes ------------------------------------------------------

export function listPromoCodesClientApi() {
  return clientApi.get<PromoCodeDto[]>("/admin/promo-codes");
}

export function createPromoCodeClientApi(body: PromoCodeCreate) {
  return clientApi.post<PromoCodeDto>("/admin/promo-codes", body);
}

export function setPromoCodeEnabledClientApi(id: string, enabled: boolean) {
  return clientApi.patch<PromoCodeDto>(`/admin/promo-codes/${id}`, { enabled });
}

export function listPromoRedemptionsClientApi(id: string) {
  return clientApi.get<PromoRedemptionDto[]>(
    `/admin/promo-codes/${id}/redemptions`,
  );
}
