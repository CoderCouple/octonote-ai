import { Global, Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { ChangeEventsService } from "../common/change-events.service";
import { EmailService } from "../common/email.service";
import { PermissionsService } from "../common/permissions.service";
import { BILLING_ENFORCED, PlanLimitsService } from "../common/plan-limits.service";
import { DatabaseModule } from "../db/database.module";
import { CanvasesRepository } from "../db/repository/canvases.repository";
import { CliTokensRepository } from "../db/repository/cli-tokens.repository";
import { ChangeEventsRepository } from "../db/repository/change-events.repository";
import { NotebooksRepository } from "../db/repository/notebooks.repository";
import { PagesRepository } from "../db/repository/pages.repository";
import { ProjectsRepository } from "../db/repository/projects.repository";
import { SharingRepository } from "../db/repository/sharing.repository";
import { UserPreferencesRepository } from "../db/repository/user-preferences.repository";
import { UsersRepository } from "../db/repository/users.repository";
import { ViewsRepository } from "../db/repository/views.repository";
import { WorkspaceMembersRepository } from "../db/repository/workspace-members.repository";
import { WorkspacesRepository } from "../db/repository/workspaces.repository";
import { CliTokensService } from "../service/cli-tokens.service";
import { NotebookPlacement } from "../service/lib/notebook-placement";
import { WorkspacesService } from "../service/workspaces.service";

const providers = [
  CanvasesRepository,
  ChangeEventsRepository,
  CliTokensRepository,
  NotebooksRepository,
  PagesRepository,
  ProjectsRepository,
  SharingRepository,
  UserPreferencesRepository,
  UsersRepository,
  ViewsRepository,
  WorkspaceMembersRepository,
  WorkspacesRepository,
  ChangeEventsService,
  // Verifies `ont_…` bearer tokens for the auth guards.
  CliTokensService,
  EmailService,
  PermissionsService,
  PlanLimitsService,
  // Free-plan limits apply only once payments are set up (see PlanLimitsService).
  { provide: BILLING_ENFORCED, useFactory: () => Boolean(process.env.STRIPE_SECRET_KEY) },
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
