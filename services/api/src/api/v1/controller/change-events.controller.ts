import {
  Controller,
  Get,
  Param,
  Query,
  Req,
  UseGuards,
} from "@nestjs/common";
import { z } from "zod";
import type { AuthenticatedRequest } from "../../../auth/supabase-auth.guard";
import { SupabaseAuthGuard } from "../../../auth/supabase-auth.guard";
import { ZodValidationPipe } from "../../../common/zod-validation.pipe";
import { ChangeEventsReaderService } from "../../../service/change-events-reader.service";
import {
  ChangeEventListQuerySchema,
  type ChangeEventListQuery,
} from "../request/change-event.request";
import { changeEventToDto, type ChangeEventDto } from "../response/change-event.response";

const IdParam = new ZodValidationPipe(z.string().min(1).max(64));

@Controller()
@UseGuards(SupabaseAuthGuard)
export class ChangeEventsController {
  constructor(private readonly events: ChangeEventsReaderService) {}

  @Get("workspaces/:workspaceId/change-events")
  async list(
    @Param("workspaceId", IdParam) workspaceId: string,
    @Query(new ZodValidationPipe(ChangeEventListQuerySchema)) query: ChangeEventListQuery,
    @Req() req: AuthenticatedRequest,
  ): Promise<ChangeEventDto[]> {
    const rows = await this.events.list(workspaceId, query, req.user.id);
    return rows.map(changeEventToDto);
  }

  @Get("change-events/:id")
  async getOne(
    @Param("id", IdParam) id: string,
    @Req() req: AuthenticatedRequest,
  ): Promise<ChangeEventDto> {
    return changeEventToDto(await this.events.getOne(id, req.user.id));
  }
}
