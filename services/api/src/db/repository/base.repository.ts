/**
 * BaseRepository — generic CRUD primitives for tables keyed by a `id` column.
 *
 * Concrete repositories extend this class and add the domain-specific queries
 * they need (e.g., listByWorkspace, findBySlug). They MUST NOT contain
 * business rules — those live in the service layer.
 *
 * Usage:
 *   @Injectable()
 *   export class WorkspacesRepository extends BaseRepository<typeof workspaces> {
 *     constructor(@Inject(DRIZZLE) db: Database) { super(db, workspaces); }
 *     async findBySlug(slug: string) { ... }
 *   }
 */
import { eq } from "drizzle-orm";
import type { PgTable, PgColumn } from "drizzle-orm/pg-core";
import type { Database } from "../database.module";

interface TableWithId {
  id: PgColumn;
}

export abstract class BaseRepository<
  TTable extends PgTable & TableWithId,
  TSelect = TTable["$inferSelect"],
  TInsert = TTable["$inferInsert"],
> {
  protected constructor(
    protected readonly db: Database,
    protected readonly table: TTable,
  ) {}

  async findById(id: string): Promise<TSelect | null> {
    const rows = (await this.db
      .select()
      .from(this.table as PgTable)
      .where(eq(this.table.id, id))
      .limit(1)) as TSelect[];
    return rows[0] ?? null;
  }

  async insert(values: TInsert): Promise<TSelect> {
    const rows = (await this.db
      .insert(this.table as PgTable)
      .values(values as never)
      .returning()) as TSelect[];
    if (!rows[0]) throw new Error(`Insert failed on ${(this.table as { _: { name?: string } })._?.name ?? "table"}`);
    return rows[0];
  }

  async updateById(id: string, patch: Partial<TInsert>): Promise<TSelect | null> {
    const rows = (await this.db
      .update(this.table as PgTable)
      .set(patch as never)
      .where(eq(this.table.id, id))
      .returning()) as TSelect[];
    return rows[0] ?? null;
  }

  async deleteById(id: string): Promise<void> {
    await this.db
      .delete(this.table as PgTable)
      .where(eq(this.table.id, id));
  }
}
