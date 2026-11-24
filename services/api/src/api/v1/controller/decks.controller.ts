import { Body, Controller, Delete, Get, Param, Patch, Post, Req, UseGuards } from "@nestjs/common";
import { z } from "zod";
import type { OptionalAuthRequest } from "../../../auth/optional-supabase-auth.guard";
import { OptionalSupabaseAuthGuard } from "../../../auth/optional-supabase-auth.guard";
import type { AuthenticatedRequest } from "../../../auth/supabase-auth.guard";
import { SupabaseAuthGuard } from "../../../auth/supabase-auth.guard";
import { ZodValidationPipe } from "../../../common/zod-validation.pipe";
import { DecksService } from "../../../service/decks.service";
import { DeckCreateSchema, DeckFromSourceSchema, DeckUpdateSchema, type DeckCreate, type DeckFromSource, type DeckUpdate } from "../request/deck.request";
import { MoveToNotebookSchema, type MoveToNotebook } from "../request/notebook.request";
import { deckSummaryToDto, deckToDto, type DeckDto, type DeckSummaryDto } from "../response/deck.response";

const IdParam = new ZodValidationPipe(z.string().min(1).max(64));

@Controller()
export class DecksController {
  constructor(private readonly decks: DecksService) {}

  /** Every presentation in the workspace, each with its notebookId. */
  @Get("workspaces/:workspaceId/decks")
  @UseGuards(SupabaseAuthGuard)
  async list(@Param("workspaceId", IdParam) workspaceId: string, @Req() req: AuthenticatedRequest): Promise<DeckSummaryDto[]> {
    return (await this.decks.list(workspaceId, req.user.id)).map(deckSummaryToDto);
  }

  /** A new presentation: empty, or the slides the app made from a note, project or notebook. */
  @Post("workspaces/:workspaceId/decks")
  @UseGuards(SupabaseAuthGuard)
  async create(
    @Param("workspaceId", IdParam) workspaceId: string,
    @Body(new ZodValidationPipe(DeckCreateSchema)) body: DeckCreate,
    @Req() req: AuthenticatedRequest,
  ): Promise<DeckDto> {
    return deckToDto(await this.decks.create(workspaceId, body, req.user.id), "owner");
  }

  /** Made from a note, project or notebook on the server (CLI, agents), as "Make presentation" does in the app. */
  @Post("workspaces/:workspaceId/decks/from")
  @UseGuards(SupabaseAuthGuard)
  async createFromSource(
    @Param("workspaceId", IdParam) workspaceId: string,
    @Body(new ZodValidationPipe(DeckFromSourceSchema)) body: DeckFromSource,
    @Req() req: AuthenticatedRequest,
  ): Promise<DeckDto> {
    return deckToDto(await this.decks.createFromSource(workspaceId, body, req.user.id), "owner");
  }

  /** Optional auth: "anyone with the link" works for signed-out visitors. */
  @Get("decks/:id")
  @UseGuards(OptionalSupabaseAuthGuard)
  async getOne(@Param("id", IdParam) id: string, @Req() req: OptionalAuthRequest): Promise<DeckDto> {
    const { deck, access } = await this.decks.getOne(id, req.user?.id ?? null);
    return deckToDto(deck, access.role);
  }

  @Patch("decks/:id")
  @UseGuards(SupabaseAuthGuard)
  async update(
    @Param("id", IdParam) id: string,
    @Body(new ZodValidationPipe(DeckUpdateSchema)) body: DeckUpdate,
    @Req() req: AuthenticatedRequest,
  ): Promise<DeckDto> {
    return deckToDto(await this.decks.update(id, body, req.user.id));
  }

  @Post("decks/:id/move")
  @UseGuards(SupabaseAuthGuard)
  async move(
    @Param("id", IdParam) id: string,
    @Body(new ZodValidationPipe(MoveToNotebookSchema)) body: MoveToNotebook,
    @Req() req: AuthenticatedRequest,
  ): Promise<DeckDto> {
    return deckToDto(await this.decks.moveToNotebook(id, body.notebookId, req.user.id));
  }

  @Delete("decks/:id")
  @UseGuards(SupabaseAuthGuard)
  async softDelete(@Param("id", IdParam) id: string, @Req() req: AuthenticatedRequest): Promise<DeckDto> {
    return deckToDto(await this.decks.softDelete(id, req.user.id));
  }
}
