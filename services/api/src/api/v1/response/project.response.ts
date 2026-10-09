import type { Role } from "../../../common/permissions.service";
import type { CreatorSummary, Project } from "../../../model/project.model";
import { sharingToDto, type SharingDto } from "./sharing.response";

export interface CreatorDto {
  id: string;
  name: string;
  email: string;
}

export interface ProjectDto extends SharingDto {
  id: string;
  workspaceId: string;
  notebookId: string | null;
  createdByUserId: string;
  name: string;
  description: string | null;
  icon: string | null;
  settings: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
  archivedAt: string | null;
  hasNote?: boolean;
  hasCanvas?: boolean;
  creator?: CreatorDto | null;
  sharedCount?: number;
}

export function projectToDto(project: Project, myRole?: Role): ProjectDto {
  return {
    id: project.id,
    workspaceId: project.workspaceId,
    notebookId: project.notebookId,
    createdByUserId: project.createdByUserId,
    name: project.name,
    description: project.description,
    icon: project.icon,
    settings: project.settings,
    ...sharingToDto(project, myRole),
    createdAt: project.createdAt.toISOString(),
    updatedAt: project.updatedAt.toISOString(),
    archivedAt: project.archivedAt ? project.archivedAt.toISOString() : null,
    ...(project.hasNote !== undefined ? { hasNote: project.hasNote } : {}),
    ...(project.hasCanvas !== undefined ? { hasCanvas: project.hasCanvas } : {}),
    ...(project.creator !== undefined ? { creator: project.creator as CreatorDto | null } : {}),
    ...(project.sharedCount !== undefined ? { sharedCount: project.sharedCount } : {}),
  };
}

export function creatorToDto(c: CreatorSummary): CreatorDto {
  return { id: c.id, name: c.name, email: c.email };
}
