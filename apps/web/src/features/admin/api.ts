import type {
  AdminAuditEntry,
  AdminCancelInput,
  AdminGrantInput,
  AdminMetricRange,
  AdminMetrics,
  AdminTraffic,
  ExploreQuery,
  ExploreResult,
  AdminUserDetail,
  AdminUserRow,
  AdminWorkspaceDetail,
  StudentDomain,
  StudentDomainCreate,
  StudentDomainUpdate,
  CreatorDashboard,
  CrmEmailInput,
  CrmFollowupCreate,
  CrmFollowupUpdate,
  CrmLogInput,
  CrmOverview,
  CrmPersonDetail,
  CrmPersonRow,
  CrmStatus,
  Partner,
  PartnerCreate,
  PartnerDetail,
  PartnerUpdate,
} from "@octonote/shared";
import { clientApi } from "@/lib/api/client-fetch";

/** The admin portal's API calls. The API allows them for staff only. */

export const getAdminMetrics = (days: AdminMetricRange, excludeStaff = false) =>
  clientApi.get<AdminMetrics>(
    `/admin/metrics?days=${days}&excludeStaff=${excludeStaff ? 1 : 0}`,
  );

/** Website traffic from PostHog, read by the API. */
export const getAdminTraffic = (days: AdminMetricRange, excludeStaff = false) =>
  clientApi.get<AdminTraffic>(
    `/admin/traffic?days=${days}&excludeStaff=${excludeStaff ? 1 : 0}`,
  );

export const adminHandoff = () =>
  clientApi.post<{ tokenHash: string }>("/admin/handoff");

export const searchAdminUsers = (q: string) =>
  clientApi.get<AdminUserRow[]>(`/admin/users?q=${encodeURIComponent(q)}`);

export const getAdminUser = (id: string) =>
  clientApi.get<AdminUserDetail>(`/admin/users/${id}`);

export const getAdminWorkspace = (id: string) =>
  clientApi.get<AdminWorkspaceDetail>(`/admin/workspaces/${id}`);

export const grantPro = (workspaceId: string, body: AdminGrantInput) =>
  clientApi.post<AdminWorkspaceDetail>(
    `/admin/workspaces/${workspaceId}/grants`,
    body,
  );

export const endGrant = (grantId: string) =>
  clientApi.post<AdminWorkspaceDetail>(`/admin/grants/${grantId}/end`);

export const cancelSubscriptionNow = (
  workspaceId: string,
  body: AdminCancelInput,
) =>
  clientApi.post<AdminWorkspaceDetail>(
    `/admin/workspaces/${workspaceId}/cancel-subscription`,
    body,
  );

export const listStudentDomains = () =>
  clientApi.get<StudentDomain[]>("/admin/student-domains");

export const addStudentDomain = (body: StudentDomainCreate) =>
  clientApi.post<StudentDomain>("/admin/student-domains", body);

/** Edit one ending (details and/or on/off); returns the updated row. */
export const updateStudentDomain = (id: string, body: StudentDomainUpdate) =>
  clientApi.patch<StudentDomain>(`/admin/student-domains/${id}`, body);

export const listAdminAudit = (before?: string) =>
  clientApi.get<AdminAuditEntry[]>(
    `/admin/audit${before ? `?before=${encodeURIComponent(before)}` : ""}`,
  );

// --- Partners (creators and influencers) ---------------------------------------

export const listPartners = () => clientApi.get<Partner[]>("/admin/partners");

export const suggestPartnerCode = (name: string) =>
  clientApi.get<{ code: string }>(
    `/admin/partners/suggest-code?name=${encodeURIComponent(name)}`,
  );

export const createPartner = (body: PartnerCreate) =>
  clientApi.post<PartnerDetail>("/admin/partners", body);

export const getPartner = (id: string) =>
  clientApi.get<PartnerDetail>(`/admin/partners/${id}`);

export const updatePartner = (id: string, body: PartnerUpdate) =>
  clientApi.patch<PartnerDetail>(`/admin/partners/${id}`, body);

/** Exactly what the creator sees in Settings → Creator program. */
export const getCreatorView = (id: string) =>
  clientApi.get<CreatorDashboard>(`/admin/partners/${id}/creator-view`);

export const markPartnerPaidOut = (id: string) =>
  clientApi.post<PartnerDetail>(`/admin/partners/${id}/payout`);

// --- Follow-ups CRM (Admin → Inbox) ---------------------------------------------

export const listCrmPeople = () =>
  clientApi.get<CrmPersonRow[]>("/admin/crm/people");

export const listCrmStaff = () =>
  clientApi.get<{ id: string; name: string; email: string }[]>(
    "/admin/crm/staff",
  );

export const getCrmPerson = (id: string) =>
  clientApi.get<CrmPersonDetail>(`/admin/crm/people/${id}`);

export const setCrmStatus = (id: string, status: CrmStatus) =>
  clientApi.patch<CrmPersonDetail>(`/admin/crm/people/${id}`, { status });

/** null = nobody looks after them. */
export const setCrmOwner = (id: string, ownerUserId: string | null) =>
  clientApi.patch<CrmPersonDetail>(`/admin/crm/people/${id}`, { ownerUserId });

/** Admin → Follow-ups, for everyone or one staff member. */
export const getCrmOverview = (owner?: string | null, weeks = 8) =>
  clientApi.get<CrmOverview>(
    `/admin/crm/overview?weeks=${weeks}${owner ? `&owner=${encodeURIComponent(owner)}` : ""}`,
  );

export const logCrmEntry = (id: string, body: CrmLogInput) =>
  clientApi.post<CrmPersonDetail>(`/admin/crm/people/${id}/entries`, body);

/** Sends from hello@octonote.ai as you, with a copy to the team inbox. */
export const sendCrmEmail = (id: string, body: CrmEmailInput) =>
  clientApi.post<CrmPersonDetail>(`/admin/crm/people/${id}/email`, body);

/** Opened in the Inbox: their replies so far are read. */
export const markCrmSeen = (id: string) =>
  clientApi.post<{ ok: true }>(`/admin/crm/people/${id}/seen`);

export const deleteCrmEntry = (entryId: string) =>
  clientApi.delete<CrmPersonDetail>(`/admin/crm/entries/${entryId}`);

export const addCrmFollowup = (id: string, body: CrmFollowupCreate) =>
  clientApi.post<CrmPersonDetail>(`/admin/crm/people/${id}/followups`, body);

export const updateCrmFollowup = (
  followupId: string,
  body: CrmFollowupUpdate,
) =>
  clientApi.patch<CrmPersonDetail>(`/admin/crm/followups/${followupId}`, body);

/** Explore: one measure grouped, split and filtered. */
export const exploreAdmin = (q: ExploreQuery) =>
  clientApi.post<ExploreResult>("/admin/explore", q);
