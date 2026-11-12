import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from "@nestjs/common";
import type { FastifyReply } from "fastify";
import { z } from "zod";
import type { AuthenticatedRequest } from "../../../auth/supabase-auth.guard";
import { SupabaseAuthGuard } from "../../../auth/supabase-auth.guard";
import { SkipResponseInterceptor } from "../../../common/interceptor/skip-response-interceptor.decorator";
import { ZodValidationPipe } from "../../../common/zod-validation.pipe";
import { ChatService, type ChatEvent } from "../../../service/chat.service";

const id = z.string().min(1).max(80);
const MentionSchema = z.object({
  kind: z.enum(["note", "canvas", "project", "notebook", "figure", "block"]),
  id,
  title: z.string().max(200),
  noteId: id.optional(),
});
const SendSchema = z.object({
  workspaceId: id,
  threadId: id.optional(),
  text: z.string().trim().min(1).max(8000),
  mentions: z.array(MentionSchema).max(8).optional(),
  here: z
    .object({
      kind: z.enum(["note", "canvas", "project", "notebook"]),
      id,
      title: z.string().max(200).optional(),
    })
    .optional(),
});
const DecideSchema = z.object({ decision: z.enum(["apply", "dismiss"]) });
const InsertSchema = z.object({
  noteId: id,
  kind: z.enum([
    "widget",
    "flashcards",
    "mcq",
    "quiz",
    "mindmap",
    "matching",
    "scene",
  ]),
  spec: z.record(z.unknown()),
});

/** The in-app AI chat. Replies stream as server-sent events. Needs ANTHROPIC_API_KEY. */
@Controller("ai/chat")
@UseGuards(SupabaseAuthGuard)
export class ChatController {
  constructor(private readonly chat: ChatService) {}

  @Get("threads")
  threads(
    @Query("workspaceId") workspaceId: string,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.chat.listThreads(req.user.id, String(workspaceId ?? ""));
  }

  /** Things to @-mention: items, figures, and blocks in the note being viewed. */
  @Get("mentions")
  mentions(
    @Query("workspaceId") workspaceId: string,
    @Query("q") q: string | undefined,
    @Query("note") note: string | undefined,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.chat.mentionables(
      req.user.id,
      String(workspaceId ?? ""),
      String(q ?? "").slice(0, 100),
      note ? String(note) : undefined,
    );
  }

  /** Adds a block shown in the chat to a note (the person clicked "Add to note"). */
  @Post("insert")
  @HttpCode(200)
  insert(
    @Body(new ZodValidationPipe(InsertSchema))
    body: z.infer<typeof InsertSchema>,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.chat.insertShown(req.user.id, body);
  }

  @Get("threads/:id")
  thread(@Param("id") threadId: string, @Req() req: AuthenticatedRequest) {
    return this.chat.getThread(req.user.id, threadId);
  }

  @Delete("threads/:id")
  @HttpCode(204)
  async remove(
    @Param("id") threadId: string,
    @Req() req: AuthenticatedRequest,
  ) {
    await this.chat.deleteThread(req.user.id, threadId);
  }

  /** Applies or dismisses a change the assistant proposed. */
  @Post("messages/:messageId/proposals/:proposalId")
  @HttpCode(200)
  decide(
    @Param("messageId") messageId: string,
    @Param("proposalId") proposalId: string,
    @Body(new ZodValidationPipe(DecideSchema))
    body: z.infer<typeof DecideSchema>,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.chat.decide(req.user.id, messageId, proposalId, body.decision);
  }

  /**
   * One turn. Refusals that happen before the reply starts (rate limit, wrong
   * workspace) come back as normal JSON errors; after that, events stream as
   * `data: {…}` lines until a `done` (or `error`) event.
   */
  @Post()
  @SkipResponseInterceptor()
  async send(
    @Body(new ZodValidationPipe(SendSchema)) body: z.infer<typeof SendSchema>,
    @Req() req: AuthenticatedRequest,
    @Res() reply: FastifyReply,
  ) {
    const abort = new AbortController();
    let open = false;
    const emit = (event: ChatEvent) => {
      if (!open) {
        open = true;
        reply.hijack();
        // Headers set on the reply (CORS) don't reach a raw response by themselves.
        const headers = Object.fromEntries(
          Object.entries(reply.getHeaders()).map(([k, v]) => [k, String(v)]),
        );
        reply.raw.writeHead(200, {
          ...headers,
          "content-type": "text/event-stream; charset=utf-8",
          "cache-control": "no-cache, no-transform",
          connection: "keep-alive",
          "x-accel-buffering": "no",
        });
        reply.raw.on("close", () => abort.abort());
      }
      if (!reply.raw.writableEnded)
        reply.raw.write(`data: ${JSON.stringify(event)}\n\n`);
    };
    try {
      await this.chat.send(req.user.id, body, emit, abort.signal);
    } catch (error) {
      // Before the stream opened, let Nest turn it into a normal error response.
      if (!open) throw error;
      emit({
        type: "error",
        message: (error as Error).message || "Something went wrong.",
      });
    }
    if (open && !reply.raw.writableEnded) reply.raw.end();
  }
}
