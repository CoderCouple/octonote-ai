import { Body, Controller, Get, HttpCode, Param, Patch, Post, Query, Req, UseGuards } from "@nestjs/common";
import {
  FEEDBACK_KINDS,
  FEEDBACK_STATUSES,
  FeedbackCreateSchema,
  FeedbackUpdateSchema,
  type FeedbackCreate,
  type FeedbackItem,
  type FeedbackKind,
  type FeedbackStatus,
  type FeedbackList,
  type FeedbackUpdate,
} from "@octonote/shared";
import { z } from "zod";
import { AdminGuard } from "../../../auth/admin.guard";
import type { AuthenticatedRequest } from "../../../auth/supabase-auth.guard";
import { SupabaseAuthGuard } from "../../../auth/supabase-auth.guard";
import { ZodValidationPipe } from "../../../common/zod-validation.pipe";
import { FeedbackService } from "../../../service/feedback.service";

const IdParam = new ZodValidationPipe(z.string().min(1).max(64));
const StatusQuery = new ZodValidationPipe(z.enum(FEEDBACK_STATUSES).optional());
const KindQuery = new ZodValidationPipe(z.enum(FEEDBACK_KINDS).optional());

/** "Report a bug" / "Request a feature", from the apps. */
@Controller("feedback")
@UseGuards(SupabaseAuthGuard)
export class FeedbackController {
  constructor(private readonly feedback: FeedbackService) {}

  @Post()
  @HttpCode(201)
  create(
    @Body(new ZodValidationPipe(FeedbackCreateSchema)) body: FeedbackCreate,
    @Req() req: AuthenticatedRequest,
  ): Promise<{ id: string }> {
    return this.feedback.create(req.user.id, body);
  }
}

/** Admin → Feedback. Staff only. */
@Controller("admin/feedback")
@UseGuards(SupabaseAuthGuard, AdminGuard)
export class AdminFeedbackController {
  constructor(private readonly feedback: FeedbackService) {}

  @Get()
  list(
    @Query("status", StatusQuery) status?: FeedbackStatus,
    @Query("kind", KindQuery) kind?: FeedbackKind,
  ): Promise<FeedbackList> {
    return this.feedback.list({ status, kind });
  }

  @Get(":id")
  get(@Param("id", IdParam) id: string): Promise<FeedbackItem> {
    return this.feedback.get(id);
  }

  @Patch(":id")
  update(
    @Param("id", IdParam) id: string,
    @Body(new ZodValidationPipe(FeedbackUpdateSchema)) body: FeedbackUpdate,
    @Req() req: AuthenticatedRequest,
  ): Promise<FeedbackItem> {
    return this.feedback.update(id, body, req.user.id);
  }
}
