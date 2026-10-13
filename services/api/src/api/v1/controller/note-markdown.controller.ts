import { Body, Controller, Get, Param, Post, Put, Req, UseGuards } from "@nestjs/common";
import { z } from "zod";
import type { OptionalAuthRequest } from "../../../auth/optional-supabase-auth.guard";
import { OptionalSupabaseAuthGuard } from "../../../auth/optional-supabase-auth.guard";
import type { AuthenticatedRequest } from "../../../auth/supabase-auth.guard";
import { SupabaseAuthGuard } from "../../../auth/supabase-auth.guard";
import { ZodValidationPipe } from "../../../common/zod-validation.pipe";
import { NoteMarkdownService } from "../../../service/note-markdown.service";
import { PageMarkdownSchema, type PageMarkdown } from "../request/page.request";
import { pageToDto, type PageDto } from "../response/page.response";

const IdParam = new ZodValidationPipe(z.string().min(1).max(64));
const AppendSchema = PageMarkdownSchema.pick({ markdown: true });

/** Notes as markdown: what the `octonote` CLI and agents read and write. */
@Controller("pages/:id/markdown")
export class NoteMarkdownController {
  constructor(private readonly notes: NoteMarkdownService) {}

  /** Same access as reading the note ("anyone with the link" included). */
  @Get()
  @UseGuards(OptionalSupabaseAuthGuard)
  read(@Param("id", IdParam) id: string, @Req() req: OptionalAuthRequest) {
    return this.notes.read(id, req.user?.id ?? null);
  }

  /** Replace the content (and optionally the title). */
  @Put()
  @UseGuards(SupabaseAuthGuard)
  async replace(
    @Param("id", IdParam) id: string,
    @Body(new ZodValidationPipe(PageMarkdownSchema)) body: PageMarkdown,
    @Req() req: AuthenticatedRequest,
  ): Promise<PageDto> {
    return pageToDto(await this.notes.replace(id, body.markdown, body.title, req.user.id));
  }

  @Post("append")
  @UseGuards(SupabaseAuthGuard)
  async append(
    @Param("id", IdParam) id: string,
    @Body(new ZodValidationPipe(AppendSchema)) body: { markdown: string },
    @Req() req: AuthenticatedRequest,
  ): Promise<PageDto> {
    return pageToDto(await this.notes.append(id, body.markdown, req.user.id));
  }
}
