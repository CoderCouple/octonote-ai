import type { Role } from "../../../common/permissions.service";
import type { Page } from "../../../model/page.model";
import { sharingToDto, type SharingDto } from "./sharing.response";

export interface PageDto extends SharingDto {
  id: string;
  workspaceId: string;
  projectId: string | null;
  notebookId: string | null;
  title: string;
  document: unknown;
  contentMd: string;
  settings: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export interface PageSummaryDto {
  id: string;
  title: string;
  notebookId: string | null;
  contentMd: string;
  updatedAt: string;
  createdAt: string;
  creator: { id: string; name: string; email: string } | null;
  linkAccess: "restricted" | "anyone_with_link";
  publishedAt: string | null;
  sharedCount: number;
}

export function pageToDto(page: Page, myRole?: Role): PageDto {
  return {
    id: page.id,
    workspaceId: page.workspaceId,
    projectId: page.projectId,
    notebookId: page.notebookId,
    title: page.title,
    document: page.document,
    contentMd: page.contentMd,
    settings: page.settings,
    ...sharingToDto(page, myRole),
    createdAt: page.createdAt.toISOString(),
    updatedAt: page.updatedAt.toISOString(),
    deletedAt: page.deletedAt ? page.deletedAt.toISOString() : null,
  };
}
