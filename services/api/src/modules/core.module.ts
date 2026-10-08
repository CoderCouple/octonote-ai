import { Global, Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { ChangeEventsService } from "../common/change-events.service";
import { EmailService } from "../common/email.service";
import { PermissionsService } from "../common/permissions.service";
import { DatabaseModule } from "../db/database.module";
import { CanvasesRepository } from "../db/repository/canvases.repository";
import { ChangeEventsRepository } from "../db/repository/change-events.repository";
import { NotebooksRepository } from "../db/repository/notebooks.repository";
import { PagesRepository } from "../db/repository/pages.repository";
import { ProjectsRepository } from "../db/repository/projects.repository";
import { SharingRepository } from "../db/repository/sharing.repository";
import { UserPreferencesRepository } from "../db/repository/user-preferences.repository";
import { UsersRepository } from "../db/repository/users.repository";
import { WorkspaceMembersRepository } from "../db/repository/workspace-members.repository";
import { WorkspacesRepository } from "../db/repository/workspaces.repository";
import { NotebookPlacement } from "../service/lib/notebook-placement";
import { WorkspacesService } from "../service/workspaces.service";

const providers = [
  CanvasesRepository,
  ChangeEventsRepository,
  NotebooksRepository,
  PagesRepository,
  ProjectsRepository,
  SharingRepository,
  UserPreferencesRepository,
  UsersRepository,
  WorkspaceMembersRepository,
  WorkspacesRepository,
  ChangeEventsService,
  EmailService,
  PermissionsService,
  NotebookPlacement,
  WorkspacesService,
];

/**
 * Repositories and cross-cutting services, global so feature modules only
 * declare their own controller + service and never import each other.
 */
@Global()
@Module({
  imports: [DatabaseModule, AuthModule],
  providers,
  exports: [...providers, AuthModule],
})
export class CoreModule {}
