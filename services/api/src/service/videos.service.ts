import { randomUUID } from "node:crypto";
import { HttpStatus, Inject, Injectable, Logger, type OnModuleInit } from "@nestjs/common";
import type { SupabaseClient } from "@supabase/supabase-js";
import { and, count, eq, gte, notInArray } from "drizzle-orm";
import { SUPABASE_CLIENT } from "../auth/supabase.tokens";
import { AppError } from "../common/error/app-error";
import { ErrorCode } from "../common/error/error-codes";
import { NotFound } from "../common/error/error-factory";
import { PlanLimitsService } from "../common/plan-limits.service";
import { Database, DRIZZLE } from "../db/database.module";
import { videos } from "../db/schemas";
import { WorkspacesService } from "./workspaces.service";

/**
 * Manim explainer videos for notes. A request becomes a job row; one job at a
 * time runs here: Claude writes the storyboard and scene code, the sandboxed
 * render worker (services/manim-worker, MANIM_WORKER_URL) turns each scene
 * into MP4, failing scenes are repaired from their traceback, and the joined
 * MP4 + poster go to the public `note-videos` bucket under an unguessable path.
 * The worker holds no secrets: the AI key and storage stay here.
 */
export const VIDEOS_BUCKET = "note-videos";

/** Videos one person may start per day, on top of Pro (renders and model calls are the costly part). */
const MAX_PER_DAY = 10;
const DAY = 86_400_000;
const MEMBER_ROLES = ["OWNER", "ADMIN", "MEMBER"] as const;

type Manim = typeof import("@octonote/manim");
type Compose = typeof import("@octonote/compose");
// ES modules, loaded with Node's require(esm) (Node 22.12+) once TypeScript turns import() into require().
// Don't use the `new Function("return import(…)")` trick here: V8 caches functions by source text,
// so a copy made inside a test sandbox can break @octonote/content's identical one.
const loadManim = (): Promise<Manim> => import("@octonote/manim");
const loadCompose = (): Promise<Compose> => import("@octonote/compose");

export type VideoStatus = "queued" | "storyboard" | "code" | "render" | "join" | "done" | "failed";

export interface VideoDto {
  id: string;
  status: VideoStatus;
  orientation: "landscape" | "portrait";
  title: string | null;
  progress: { done?: number; total?: number; repaired?: number; fallbacks?: number } | null;
  chapters: { title: string; caption: string; start: number; end: number; fallback?: boolean }[] | null;
  url: string | null;
  posterUrl: string | null;
  duration: number | null;
  error: string | null;
}

@Injectable()
export class VideosService implements OnModuleInit {
  private readonly logger = new Logger(VideosService.name);
  private readonly queue: string[] = [];
  private running = false;

  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    @Inject(SUPABASE_CLIENT) private readonly supabase: SupabaseClient,
    private readonly planLimits: PlanLimitsService,
    private readonly workspaces: WorkspacesService,
  ) {}

  /** Jobs don't survive a restart: anything unfinished is marked failed so its block can offer a retry. */
  async onModuleInit() {
    // Never block startup on this: a database hiccup here shouldn't keep the API down.
    try {
      await this.db
        .update(videos)
        .set({ status: "failed", error: "The server restarted while this was being made. Try again.", updatedAt: new Date() })
        .where(notInArray(videos.status, ["done", "failed"]));
    } catch (error) {
      this.logger.warn(`Couldn't mark interrupted videos as failed: ${(error as Error).message}`);
    }
  }

  async create(userId: string, input: { workspaceId: string; concept: string; orientation: "landscape" | "portrait" }): Promise<VideoDto> {
    await this.workspaces.requireRole(userId, input.workspaceId, [...MEMBER_ROLES]);
    // Pro only, like every limit: enforced once billing is configured.
    if (this.planLimits.enforced && (await this.planLimits.planOf(input.workspaceId)) !== "pro") {
      throw new AppError(ErrorCode.PLAN_LIMIT, "Explainer videos are part of Pro.", HttpStatus.PAYMENT_REQUIRED);
    }
    if (!process.env.ANTHROPIC_API_KEY?.trim() || !process.env.MANIM_WORKER_URL?.trim()) {
      throw new AppError(ErrorCode.SERVER_ERROR, "Video generation isn't set up on this server.", HttpStatus.SERVICE_UNAVAILABLE);
    }
    const [recent] = await this.db
      .select({ n: count() })
      .from(videos)
      .where(and(eq(videos.createdByUserId, userId), gte(videos.createdAt, new Date(Date.now() - DAY))));
    if ((recent?.n ?? 0) >= MAX_PER_DAY) {
      throw new AppError(ErrorCode.RATE_LIMITED, `That's ${MAX_PER_DAY} videos today. Please try again tomorrow.`, HttpStatus.TOO_MANY_REQUESTS);
    }
    const [row] = await this.db
      .insert(videos)
      .values({ workspaceId: input.workspaceId, createdByUserId: userId, concept: input.concept, orientation: input.orientation })
      .returning();
    this.queue.push(row!.id);
    void this.drain();
    return this.toDto(row!);
  }

  /** Public: the id is unguessable and the video is meant to be watched by anyone reading the note. */
  async get(id: string): Promise<VideoDto> {
    const [row] = await this.db.select().from(videos).where(eq(videos.id, id));
    if (!row) throw NotFound("Video not found.");
    return this.toDto(row);
  }

  private async drain() {
    if (this.running) return;
    this.running = true;
    try {
      for (let id = this.queue.shift(); id; id = this.queue.shift()) await this.run(id);
    } finally {
      this.running = false;
    }
  }

  private async update(id: string, patch: Partial<typeof videos.$inferInsert>) {
    await this.db.update(videos).set({ ...patch, updatedAt: new Date() }).where(eq(videos.id, id));
  }

  private async run(id: string) {
    const [row] = await this.db.select().from(videos).where(eq(videos.id, id));
    if (!row) return;
    try {
      const [manim, compose, { default: Anthropic }] = await Promise.all([loadManim(), loadCompose(), import("@anthropic-ai/sdk")]);
      const model = compose.anthropicModel(new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! }), process.env.COMPOSE_MODEL?.trim() || "claude-opus-5-5");
      const renderer = manim.workerRenderer(process.env.MANIM_WORKER_URL!, process.env.MANIM_WORKER_TOKEN);
      const video = await manim.generateVideo({
        concept: row.concept,
        orientation: row.orientation === "portrait" ? "portrait" : "landscape",
        model,
        renderer,
        onProgress: (p) => void this.update(id, { status: p.stage, progress: p }).catch(() => {}),
      });

      const base = `${row.workspaceId}/${id}-${randomUUID()}`;
      const upload = async (path: string, data: string, contentType: string) => {
        const { error } = await this.supabase.storage.from(VIDEOS_BUCKET).upload(path, Buffer.from(data, "base64"), { contentType, upsert: false });
        if (error) throw new Error(`Upload failed: ${error.message}`);
      };
      await upload(`${base}.mp4`, video.mp4, "video/mp4");
      if (video.poster) await upload(`${base}.jpg`, video.poster, "image/jpeg");
      await this.update(id, {
        status: "done",
        title: video.title,
        chapters: video.chapters,
        videoPath: `${base}.mp4`,
        posterPath: video.poster ? `${base}.jpg` : null,
        durationSeconds: video.duration,
        bytes: video.bytes,
        progress: { done: video.chapters.length, total: video.chapters.length, repaired: video.repaired, fallbacks: video.fallbacks },
        error: null,
      });
    } catch (error) {
      this.logger.warn(`Video ${id} failed: ${(error as Error).message}`);
      await this.update(id, { status: "failed", error: (error as Error).message.slice(0, 500) }).catch(() => {});
    }
  }

  private publicUrl(path: string | null): string | null {
    return path ? this.supabase.storage.from(VIDEOS_BUCKET).getPublicUrl(path).data.publicUrl : null;
  }

  private toDto(row: typeof videos.$inferSelect): VideoDto {
    return {
      id: row.id,
      status: row.status as VideoStatus,
      orientation: row.orientation === "portrait" ? "portrait" : "landscape",
      title: row.title,
      progress: (row.progress as VideoDto["progress"]) ?? null,
      chapters: (row.chapters as VideoDto["chapters"]) ?? null,
      url: this.publicUrl(row.videoPath),
      posterUrl: this.publicUrl(row.posterPath),
      duration: row.durationSeconds,
      error: row.error,
    };
  }
}
