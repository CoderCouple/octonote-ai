import type { Role } from "../../../common/permissions.service";
import type { Notebook } from "../../../model/notebook.model";
import type { CanvasSummaryDto } from "./canvas.response";
import type { PageSummaryDto } from "./page.response";
import type { ProjectDto } from "./project.response";
import { sharingToDto, type SharingDto } from "./sharing.response";

export interface NotebookDto extends SharingDto {
  id: string;
  workspaceId: string;
  createdByUserId: string;
  name: string;
  icon: string | null;
  createdAt: string;
  updatedAt: string;
  sharedCount?: number;
}

export interface NotebookContentsDto {
  notebook: NotebookDto;
  notes: PageSummaryDto[];
  canvases: CanvasSummaryDto[];
  projects: ProjectDto[];
}

export function notebookToDto(notebook: Notebook, myRole?: Role): NotebookDto {
  return {
    id: notebook.id,
    workspaceId: notebook.workspaceId,
    createdByUserId: notebook.createdByUserId,
    name: notebook.name,
    icon: notebook.icon,
    ...sharingToDto(notebook, myRole),
    createdAt: notebook.createdAt.toISOString(),
    updatedAt: notebook.updatedAt.toISOString(),
    ...(notebook.sharedCount !== undefined ? { sharedCount: notebook.sharedCount } : {}),
  };
}
