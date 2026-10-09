import { AnalyticsController } from "../api/v1/controller/analytics.controller";
import { AnalyticsService } from "../service/analytics.service";
import { Module } from "@nestjs/common";
import { CanvasesController } from "../api/v1/controller/canvases.controller";
import { ChangeEventsController } from "../api/v1/controller/change-events.controller";
import { NotebooksController } from "../api/v1/controller/notebooks.controller";
import { PagesController } from "../api/v1/controller/pages.controller";
import { ProjectsController } from "../api/v1/controller/projects.controller";
import { PublicController } from "../api/v1/controller/public.controller";
import { SharingController } from "../api/v1/controller/sharing.controller";
import { WorkspacesController } from "../api/v1/controller/workspaces.controller";
import { CanvasesService } from "../service/canvases.service";
import { ChangeEventsReaderService } from "../service/change-events-reader.service";
import { NotebooksService } from "../service/notebooks.service";
import { PagesService } from "../service/pages.service";
import { ProjectsService } from "../service/projects.service";
import { PublicService } from "../service/public.service";
import { SharesService } from "../service/shares.service";
import { SharingSettingsService } from "../service/sharing-settings.service";

/** Notes, canvases, projects, notebooks, sharing/publishing, workspaces, audit. */
@Module({
  controllers: [
    WorkspacesController,
    NotebooksController,
    ProjectsController,
    PagesController,
    CanvasesController,
    SharingController,
    PublicController,
    ChangeEventsController,
    AnalyticsController,
  ],
  providers: [
    NotebooksService,
    ProjectsService,
    PagesService,
    CanvasesService,
    SharesService,
    SharingSettingsService,
    PublicService,
    ChangeEventsReaderService,
    AnalyticsService,
  ],
})
export class FeaturesModule {}
