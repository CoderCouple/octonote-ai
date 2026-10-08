import { clientApi } from "@/lib/api/client-fetch";
import type {
  LinkAccess,
  PublishState,
  ResourceKind,
  Share,
  SharedWithMeItem,
  ShareRole,
} from "../types";

export function listPeopleApi(kind: ResourceKind, id: string) {
  return clientApi.get<Share[]>(`/${kind}/${id}/shares`);
}

export function addPersonApi(input: {
  resourceKind: ResourceKind;
  resourceId: string;
  email: string;
  role: ShareRole;
}) {
  return clientApi.post<Share & { emailSent: boolean }>("/shares", input);
}

export function updatePersonRoleApi(shareId: string, role: ShareRole) {
  return clientApi.patch<{ id: string; role: ShareRole }>(`/shares/${shareId}`, { role });
}

export function removePersonApi(shareId: string) {
  return clientApi.delete<void>(`/shares/${shareId}`);
}

export function setGeneralAccessApi(
  kind: ResourceKind,
  id: string,
  linkAccess: LinkAccess,
  linkRole: ShareRole,
) {
  return clientApi.put<void>(`/${kind}/${id}/general-access`, { linkAccess, linkRole });
}

export function getPublishStateApi(kind: ResourceKind, id: string) {
  return clientApi.get<PublishState>(`/${kind}/${id}/publish`);
}

export function setPublishedApi(kind: ResourceKind, id: string, published: boolean) {
  return clientApi.put<PublishState>(`/${kind}/${id}/publish`, { published });
}

export function sharedWithMeApi() {
  return clientApi.get<SharedWithMeItem[]>("/me/shared");
}
