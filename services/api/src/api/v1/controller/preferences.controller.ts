import { Body, Controller, Get, Patch, Req, UseGuards } from "@nestjs/common";
import type { AuthenticatedRequest } from "../../../auth/supabase-auth.guard";
import { SupabaseAuthGuard } from "../../../auth/supabase-auth.guard";
import { ZodValidationPipe } from "../../../common/zod-validation.pipe";
import { PreferencesService } from "../../../service/preferences.service";
import {
  UserPreferenceUpdateSchema,
  type UserPreferenceUpdate,
} from "../request/preferences.request";
import { userPreferenceToDto, type UserPreferenceDto } from "../response/preferences.response";

@Controller("me/preferences")
@UseGuards(SupabaseAuthGuard)
export class PreferencesController {
  constructor(private readonly prefs: PreferencesService) {}

  @Get()
  async get(@Req() req: AuthenticatedRequest): Promise<UserPreferenceDto> {
    return userPreferenceToDto(await this.prefs.getOrCreate(req.user.id));
  }

  @Patch()
  async patch(
    @Body(new ZodValidationPipe(UserPreferenceUpdateSchema)) body: UserPreferenceUpdate,
    @Req() req: AuthenticatedRequest,
  ): Promise<UserPreferenceDto> {
    return userPreferenceToDto(await this.prefs.update(req.user.id, body));
  }
}
