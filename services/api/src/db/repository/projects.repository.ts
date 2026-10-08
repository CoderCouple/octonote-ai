import { Inject, Injectable } from "@nestjs/common";
import { and, desc, eq, inArray, isNull, type SQL } from "drizzle-orm";
import { Database, DRIZZLE } from "../database.module";
import { canvases } from "../schemas/canvases";
import { pages } from "../schemas/pages";
import { projects } from "../schemas/projects";
import { users } from "../schemas/users";
import { BaseRepository } from "./base.repository";

export interface CreatorSummary {
  id: string;
  name: string;
  email: string;
}

export type ProjectRowWithCounts = typeof projects.$inferSelect & {
  hasNote: boolean;
  hasCanvas: boolean;
  creator: CreatorSummary | null;
};

@Injectable()
export class ProjectsRepository extends BaseRepository<typeof projects> {
  constructor(@Inject(DRIZZLE) db: Database) {
    super(db, projects);
  }

  listByWorkspace(workspaceId: string): Promise<ProjectRowWithCounts[]> {
    return this.listWithCounts(eq(projects.workspaceId, workspaceId));
  }

  listByNotebook(notebookId: string): Promise<ProjectRowWithCounts[]> {
    return this.listWithCounts(eq(projects.notebookId, notebookId));
  }

  /** Active projects annotated with note/canvas presence and creator. */
  private async listWithCounts(where: SQL): Promise<ProjectRowWithCounts[]> {
    const projectRows = await this.db
      .select()
      .from(projects)
      .where(and(where, isNull(projects.archivedAt)))
      .orderBy(desc(projects.updatedAt));

    if (projectRows.length === 0) return [];

    const projectIds = projectRows.map((p) => p.id);
    const creatorIds = Array.from(new Set(projectRows.map((p) => p.createdByUserId)));

    const [pageRows, canvasRows, creatorRows] = await Promise.all([
      this.db
        .select({ projectId: pages.projectId })
        .from(pages)
        .where(and(inArray(pages.projectId, projectIds), isNull(pages.deletedAt))),
      this.db
        .select({ projectId: canvases.projectId })
        .from(canvases)
        .where(and(inArray(canvases.projectId, projectIds), isNull(canvases.deletedAt))),
      this.db
        .select({ id: users.id, name: users.name, email: users.email })
        .from(users)
        .where(inArray(users.id, creatorIds)),
    ]);

    const hasNoteSet = new Set(pageRows.map((r) => r.projectId));
    const hasCanvasSet = new Set(canvasRows.map((r) => r.projectId));
    const creatorById = new Map(creatorRows.map((r) => [r.id, r]));

    return projectRows.map((row) => ({
      ...row,
      hasNote: hasNoteSet.has(row.id),
      hasCanvas: hasCanvasSet.has(row.id),
      creator: creatorById.get(row.createdByUserId) ?? null,
    }));
  }

  /** A project never exists without its note + canvas, so all three insert atomically. */
  async insertWithPair(input: {
    project: typeof projects.$inferInsert;
    noteTitle: string;
    canvasTitle: string;
  }) {
    return this.db.transaction(async (tx) => {
      const [project] = await tx.insert(projects).values(input.project).returning();
      if (!project) throw new Error("Insert failed on projects");
      const common = {
        workspaceId: project.workspaceId,
        projectId: project.id,
        createdByUserId: project.createdByUserId,
        document: {},
      };
      const [page] = await tx
        .insert(pages)
        .values({ ...common, title: input.noteTitle })
        .returning();
      const [canvas] = await tx
        .insert(canvases)
        .values({ ...common, title: input.canvasTitle })
        .returning();
      if (!page || !canvas) throw new Error("Insert failed on project pair");
      return { project, page, canvas };
    });
  }

  async archiveById(id: string) {
    const rows = await this.db
      .update(projects)
      .set({ archivedAt: new Date() })
      .where(eq(projects.id, id))
      .returning();
    return rows[0] ?? null;
  }
}
