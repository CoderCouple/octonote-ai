import { Controller, Get, Req, UseGuards } from "@nestjs/common";
import type { AuthenticatedRequest } from "../../../auth/supabase-auth.guard";
import { SupabaseAuthGuard } from "../../../auth/supabase-auth.guard";
import { MeService } from "../../../service/me.service";
import {
  membershipPairToDto,
  userToDto,
  type MeDto,
} from "../response/me.response";

@Controller("me")
@UseGuards(SupabaseAuthGuard)
export class MeController {
  constructor(private readonly me: MeService) {}

  @Get()
  async getMe(@Req() req: AuthenticatedRequest): Promise<MeDto> {
    const result = await this.me.sync(req.user);
    return {
      user: userToDto(result.user),
      memberships: result.memberships.map((m) =>
        membershipPairToDto(m.membership, m.workspace),
      ),
    };
  }
}
