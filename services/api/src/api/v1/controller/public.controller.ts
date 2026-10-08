import { Controller, Get, Param } from "@nestjs/common";
import { z } from "zod";
import { ZodValidationPipe } from "../../../common/zod-validation.pipe";
import type { ResourceKind } from "../../../model/sharing.model";
import { PublicService, type PublicView } from "../../../service/public.service";
import { ResourceKindSchema } from "../request/sharing.request";

const SlugParam = new ZodValidationPipe(z.string().regex(/^[a-z0-9-]{1,80}$/));
const IdParam = new ZodValidationPipe(z.string().min(1).max(64));
const KindParam = new ZodValidationPipe(ResourceKindSchema);

/** Unauthenticated reads of published content, backing the /pub/<slug> pages. */
@Controller("public")
export class PublicController {
  constructor(private readonly publicService: PublicService) {}

  @Get(":slug")
  getBySlug(@Param("slug", SlugParam) slug: string): Promise<PublicView> {
    return this.publicService.getBySlug(slug);
  }

  /** An item inside a published notebook or project. */
  @Get(":slug/:kind/:id")
  getChild(
    @Param("slug", SlugParam) slug: string,
    @Param("kind", KindParam) kind: ResourceKind,
    @Param("id", IdParam) id: string,
  ): Promise<PublicView> {
    return this.publicService.getChild(slug, kind, id);
  }
}
