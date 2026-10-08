import { Inject, Injectable } from "@nestjs/common";
import { eq } from "drizzle-orm";
import { Database, DRIZZLE } from "../database.module";
import { workspaces } from "../schemas/workspaces";
import { BaseRepository } from "./base.repository";

@Injectable()
export class WorkspacesRepository extends BaseRepository<typeof workspaces> {
  constructor(@Inject(DRIZZLE) db: Database) {
    super(db, workspaces);
  }

  async findBySlug(slug: string) {
    const rows = await this.db
      .select()
      .from(workspaces)
      .where(eq(workspaces.slug, slug))
      .limit(1);
    return rows[0] ?? null;
  }

  /** True if `slug` is already taken by another workspace. */
  async slugIsTaken(slug: string): Promise<boolean> {
    const existing = await this.findBySlug(slug);
    return existing !== null;
  }
}
