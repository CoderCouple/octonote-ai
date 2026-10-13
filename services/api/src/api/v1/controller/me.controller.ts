import { Body, Controller, Delete, Get, Patch, Req, UseGuards } from "@nestjs/common";
import { z } from "zod";
import type { AuthenticatedRequest } from "../../../auth/supabase-auth.guard";
import { SupabaseAuthGuard } from "../../../auth/supabase-auth.guard";
import { ZodValidationPipe } from "../../../common/zod-validation.pipe";
import { AccountService } from "../../../service/account.service";
import { MeService } from "../../../service/me.service";
import {
  membershipPairToDto,
  userToDto,
  type MeDto,
} from "../response/me.response";

// Defined before the class: decorator arguments run when the class is defined.
const DeleteAccountSchema = z.object({ confirmEmail: z.string().min(3).max(320) });
const UpdateMeSchema = z.object({ name: z.string().min(1).max(80) });

@Controller("me")
@UseGuards(SupabaseAuthGuard)
export class MeController {
  constructor(
    private readonly me: MeService,
    private readonly account: AccountService,
  ) {}

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

  /** Change your display name (shown in the app and on published pages). */
  @Patch()
  async updateMe(
    @Body(new ZodValidationPipe(UpdateMeSchema)) body: { name: string },
    @Req() req: AuthenticatedRequest,
  ) {
    return userToDto(await this.me.updateName(req.user.id, body.name));
  }

  /** Permanently delete the signed-in account. Body: the user's email, typed to confirm. */
  @Delete()
  async deleteMe(
    @Body(new ZodValidationPipe(DeleteAccountSchema)) body: { confirmEmail: string },
    @Req() req: AuthenticatedRequest,
  ): Promise<{ deleted: true }> {
    await this.account.deleteAccount(req.user.id, req.user.email ?? "", body.confirmEmail);
    return { deleted: true };
  }
}
