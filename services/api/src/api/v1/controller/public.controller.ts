import { Body, Controller, Get, Param, Put, Req, UseGuards } from "@nestjs/common";
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
import { VotesService, type VoteSummary } from "../../../service/votes.service";
import { ResourceKindSchema } from "../request/sharing.request";

const VoteSchema = z.object({ value: z.union([z.literal(1), z.literal(-1), z.literal(0)]) });

// "_" is accepted for slugs minted before randomSuffix() was fixed.
const SlugParam = new ZodValidationPipe(z.string().regex(/^[a-z0-9_-]{1,80}$/));
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
    private readonly votes: VotesService,
  ) {}

  /** Up/down counts (and your own vote, if signed in) for an item under a published slug. */
  @Get(":slug/:kind/:id/votes")
  getVotes(
    @Param("slug", SlugParam) slug: string,
    @Param("kind", KindParam) kind: ResourceKind,
    @Param("id", IdParam) id: string,
    @Req() req: OptionalAuthRequest,
  ): Promise<VoteSummary> {
    return this.votes.summary(slug, kind, id, req.user?.id ?? null);
  }

  /** Cast, change (1 / -1) or remove (0) your vote. Signed-in readers only. */
  @Put(":slug/:kind/:id/votes")
  vote(
    @Param("slug", SlugParam) slug: string,
    @Param("kind", KindParam) kind: ResourceKind,
    @Param("id", IdParam) id: string,
    @Body(new ZodValidationPipe(VoteSchema)) body: z.infer<typeof VoteSchema>,
    @Req() req: OptionalAuthRequest,
  ): Promise<VoteSummary> {
    return this.votes.vote(slug, kind, id, req.user?.id ?? null, body.value);
  }

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
