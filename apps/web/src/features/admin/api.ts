import type {
  AdminAuditEntry,
  AdminCancelInput,
  AdminGrantInput,
  AdminMetricRange,
  AdminMetrics,
  AdminUserDetail,
  AdminUserRow,
  AdminWorkspaceDetail,
  StudentDomain,
  StudentDomainCreate,
  StudentDomainUpdate,
  CreatorDashboard,
  Partner,
  PartnerCreate,
  PartnerDetail,
  PartnerUpdate,
} from "@octonote/shared";
import { clientApi } from "@/lib/api/client-fetch";

/** The admin portal's API calls. The API allows them for staff only. */

export const getAdminMetrics = (days: AdminMetricRange) =>
  clientApi.get<AdminMetrics>(`/admin/metrics?days=${days}`);

export const adminHandoff = () => clientApi.post<{ tokenHash: string }>("/admin/handoff");

export const searchAdminUsers = (q: string) =>
  clientApi.get<AdminUserRow[]>(`/admin/users?q=${encodeURIComponent(q)}`);

export const getAdminUser = (id: string) => clientApi.get<AdminUserDetail>(`/admin/users/${id}`);

export const getAdminWorkspace = (id: string) =>
  clientApi.get<AdminWorkspaceDetail>(`/admin/workspaces/${id}`);

export const grantPro = (workspaceId: string, body: AdminGrantInput) =>
  clientApi.post<AdminWorkspaceDetail>(`/admin/workspaces/${workspaceId}/grants`, body);

export const endGrant = (grantId: string) =>
  clientApi.post<AdminWorkspaceDetail>(`/admin/grants/${grantId}/end`);

export const cancelSubscriptionNow = (workspaceId: string, body: AdminCancelInput) =>
  clientApi.post<AdminWorkspaceDetail>(`/admin/workspaces/${workspaceId}/cancel-subscription`, body);

export const listStudentDomains = () => clientApi.get<StudentDomain[]>("/admin/student-domains");

export const addStudentDomain = (body: StudentDomainCreate) =>
  clientApi.post<StudentDomain>("/admin/student-domains", body);

/** Edit one ending (details and/or on/off); returns the updated row. */
export const updateStudentDomain = (id: string, body: StudentDomainUpdate) =>
  clientApi.patch<StudentDomain>(`/admin/student-domains/${id}`, body);

export const listAdminAudit = (before?: string) =>
  clientApi.get<AdminAuditEntry[]>(`/admin/audit${before ? `?before=${encodeURIComponent(before)}` : ""}`);

// --- Partners (creators and influencers) ---------------------------------------

export const listPartners = () => clientApi.get<Partner[]>("/admin/partners");

export const suggestPartnerCode = (name: string) =>
  clientApi.get<{ code: string }>(`/admin/partners/suggest-code?name=${encodeURIComponent(name)}`);

export const createPartner = (body: PartnerCreate) => clientApi.post<PartnerDetail>("/admin/partners", body);

export const getPartner = (id: string) => clientApi.get<PartnerDetail>(`/admin/partners/${id}`);

export const updatePartner = (id: string, body: PartnerUpdate) =>
  clientApi.patch<PartnerDetail>(`/admin/partners/${id}`, body);

/** Exactly what the creator sees in Settings → Creator program. */
export const getCreatorView = (id: string) => clientApi.get<CreatorDashboard>(`/admin/partners/${id}/creator-view`);

export const markPartnerPaidOut = (id: string) => clientApi.post<PartnerDetail>(`/admin/partners/${id}/payout`);
