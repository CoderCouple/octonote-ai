import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Put,
  Req,
  UseGuards,
} from "@nestjs/common";
import { z } from "zod";
import type { AuthenticatedRequest } from "../../../auth/supabase-auth.guard";
import { SupabaseAuthGuard } from "../../../auth/supabase-auth.guard";
import { ZodValidationPipe } from "../../../common/zod-validation.pipe";
import type { ResourceKind } from "../../../model/sharing.model";
import { SharesService } from "../../../service/shares.service";
import { SharingSettingsService } from "../../../service/sharing-settings.service";
import {
  GeneralAccessUpdateSchema,
  PublishUpdateSchema,
  ResourceKindSchema,
  ShareCreateSchema,
  ShareUpdateSchema,
  type GeneralAccessUpdate,
  type PublishUpdate,
  type ShareCreate,
  type ShareUpdate,
} from "../request/sharing.request";
import { shareToDto, type PublishStateDto, type ShareDto } from "../response/sharing.response";

const IdParam = new ZodValidationPipe(z.string().min(1).max(64));
const KindParam = new ZodValidationPipe(ResourceKindSchema);

function actorName(req: AuthenticatedRequest): string | undefined {
  const meta = req.user.user_metadata ?? {};
  return (meta.full_name as string | undefined) ?? (meta.name as string | undefined);
}

@Controller()
@UseGuards(SupabaseAuthGuard)
export class SharingController {
  constructor(
    private readonly shares: SharesService,
    private readonly settings: SharingSettingsService,
  ) {}

  // --- People with access -------------------------------------------------

  @Get(":kind/:id/shares")
  async list(
    @Param("kind", KindParam) kind: ResourceKind,
    @Param("id", IdParam) id: string,
    @Req() req: AuthenticatedRequest,
  ): Promise<ShareDto[]> {
    const rows = await this.shares.list(kind, id, req.user.id);
    return rows.map((r) => shareToDto(r.share, r.user));
  }

  @Post("shares")
  async add(
    @Body(new ZodValidationPipe(ShareCreateSchema)) body: ShareCreate,
    @Req() req: AuthenticatedRequest,
  ): Promise<ShareDto & { emailSent: boolean }> {
    const r = await this.shares.add(body, {
      id: req.user.id,
      email: req.user.email,
      name: actorName(req),
    });
    return { ...shareToDto(r.share, r.user), emailSent: r.emailSent };
  }

  @Patch("shares/:id")
  async updateRole(
    @Param("id", IdParam) id: string,
    @Body(new ZodValidationPipe(ShareUpdateSchema)) body: ShareUpdate,
    @Req() req: AuthenticatedRequest,
  ): Promise<{ id: string; role: string }> {
    const share = await this.shares.updateRole(id, body.role, req.user.id);
    return { id: share.id, role: share.role };
  }

  @Delete("shares/:id")
  @HttpCode(204)
  async revoke(@Param("id", IdParam) id: string, @Req() req: AuthenticatedRequest): Promise<void> {
    await this.shares.revoke(id, req.user.id);
  }

  @Get("me/shared")
  async sharedWithMe(@Req() req: AuthenticatedRequest) {
    const items = await this.shares.sharedWithMe(req.user.id);
    return items.map((i) => ({ ...i, sharedAt: i.sharedAt.toISOString() }));
  }

  // --- General access + publish -------------------------------------------

  @Put(":kind/:id/general-access")
  @HttpCode(204)
  async setGeneralAccess(
    @Param("kind", KindParam) kind: ResourceKind,
    @Param("id", IdParam) id: string,
    @Body(new ZodValidationPipe(GeneralAccessUpdateSchema)) body: GeneralAccessUpdate,
    @Req() req: AuthenticatedRequest,
  ): Promise<void> {
    await this.settings.setGeneralAccess(kind, id, body, req.user.id);
  }

  @Get(":kind/:id/publish")
  async getPublishState(
    @Param("kind", KindParam) kind: ResourceKind,
    @Param("id", IdParam) id: string,
    @Req() req: AuthenticatedRequest,
  ): Promise<PublishStateDto> {
    return this.settings.getPublishState(kind, id, req.user.id);
  }

  @Put(":kind/:id/publish")
  async setPublished(
    @Param("kind", KindParam) kind: ResourceKind,
    @Param("id", IdParam) id: string,
    @Body(new ZodValidationPipe(PublishUpdateSchema)) body: PublishUpdate,
    @Req() req: AuthenticatedRequest,
  ): Promise<PublishStateDto> {
    return this.settings.setPublished(kind, id, body.published, req.user.id);
  }
}
