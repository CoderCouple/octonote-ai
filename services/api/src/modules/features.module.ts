import { AnalyticsController } from "../api/v1/controller/analytics.controller";
import { AnalyticsService } from "../service/analytics.service";
import { Module } from "@nestjs/common";
import Stripe from "stripe";
import {
  BillingController,
  BillingWebhookController,
} from "../api/v1/controller/billing.controller";
import { BILLING_CONFIG, BillingService, STRIPE_CLIENT } from "../service/billing.service";
import { FiguresController } from "../api/v1/controller/figures.controller";
import { FiguresService } from "../service/figures.service";
import { VotesService } from "../service/votes.service";
import { CanvasesController } from "../api/v1/controller/canvases.controller";
import { CliTokensController } from "../api/v1/controller/cli-tokens.controller";
import { NoteMarkdownController } from "../api/v1/controller/note-markdown.controller";
import { NoteMarkdownService } from "../service/note-markdown.service";
import { AdminMetricsController } from "../api/v1/controller/admin-metrics.controller";
import { AdminPromoController } from "../api/v1/controller/admin-promo.controller";
import { AdminGuard } from "../auth/admin.guard";
import { AdminMetricsService } from "../service/admin-metrics.service";
import { PromotionsService } from "../service/promotions.service";
import { CanvasDiagramService } from "../service/canvas-diagram.service";
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
    BillingController,
    BillingWebhookController,
    FiguresController,
    CliTokensController,
    NoteMarkdownController,
    AdminPromoController,
    AdminMetricsController,
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
    BillingService,
    FiguresService,
    VotesService,
    NoteMarkdownService,
    CanvasDiagramService,
    PromotionsService,
    AdminMetricsService,
    AdminGuard,
    {
      provide: STRIPE_CLIENT,
      useFactory: () =>
        process.env.STRIPE_SECRET_KEY ? new Stripe(process.env.STRIPE_SECRET_KEY) : null,
    },
    {
      provide: BILLING_CONFIG,
      useFactory: () => ({
        webhookSecret: process.env.STRIPE_WEBHOOK_SECRET,
        prices: {
          month: process.env.STRIPE_PRICE_PRO_MONTH,
          year: process.env.STRIPE_PRICE_PRO_YEAR,
        },
      }),
    },
  ],
})
export class FeaturesModule {}
