import { Controller, Get, Param, Req, UseGuards } from "@nestjs/common";
import { z } from "zod";
import {
  OptionalSupabaseAuthGuard,
  type OptionalAuthRequest,
} from "../../../auth/optional-supabase-auth.guard";
import { ZodValidationPipe } from "../../../common/zod-validation.pipe";
import type { ResourceKind } from "../../../model/sharing.model";
import { AnalyticsService } from "../../../service/analytics.service";
import {
  PublicService,
  type PublicView,
} from "../../../service/public.service";
import { ResourceKindSchema } from "../request/sharing.request";

const SlugParam = new ZodValidationPipe(z.string().regex(/^[a-z0-9-]{1,80}$/));
const IdParam = new ZodValidationPipe(z.string().min(1).max(64));
const KindParam = new ZodValidationPipe(ResourceKindSchema);

/** Sent by the web app's page render (not its metadata/OG render) to count one view. */
const VIEW_HEADER = "x-octonote-view";
/** The reader's user agent, forwarded by the web app so bots can be skipped. */
const UA_HEADER = "x-octonote-ua";
/** The reader's IP, forwarded only to compute today's anonymous visitor hash. */
const IP_HEADER = "x-octonote-ip";

/**
 * Unauthenticated reads of published content, backing the /pub/<slug> pages.
 * A signed-in reader's token (optional) lets the counter count them once per
 * day by account and skip the item's own owners and editors.
 */
@Controller("public")
@UseGuards(OptionalSupabaseAuthGuard)
export class PublicController {
  constructor(
    private readonly publicService: PublicService,
    private readonly analytics: AnalyticsService,
  ) {}

  @Get(":slug")
  async getBySlug(
    @Param("slug", SlugParam) slug: string,
    @Req() req: OptionalAuthRequest,
  ): Promise<PublicView> {
    const view = await this.publicService.getBySlug(slug);
    this.count(req, view.root.kind, view.root.id);
    return view;
  }

  /** An item inside a published notebook or project. */
  @Get(":slug/:kind/:id")
  async getChild(
    @Param("slug", SlugParam) slug: string,
    @Param("kind", KindParam) kind: ResourceKind,
    @Param("id", IdParam) id: string,
    @Req() req: OptionalAuthRequest,
  ): Promise<PublicView> {
    const view = await this.publicService.getChild(slug, kind, id);
    this.count(req, kind, id);
    return view;
  }

  /** Fire-and-forget: a failed counter must never break reading the page. */
  private count(req: OptionalAuthRequest, kind: ResourceKind, id: string) {
    const h = req.headers;
    if (h[VIEW_HEADER] !== "1") return;
    void this.analytics
      .recordView(kind, id, {
        userAgent: h[UA_HEADER],
        ip: h[IP_HEADER],
        userId: req.user?.id ?? null,
      })
      .catch(() => {});
  }
}
