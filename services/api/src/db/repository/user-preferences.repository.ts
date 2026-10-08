import { Inject, Injectable } from "@nestjs/common";
import { eq } from "drizzle-orm";
import { Database, DRIZZLE } from "../database.module";
import { userPreferences } from "../schemas/preferences";

/**
 * userPreferences uses userId as the primary key, not "id", so we can't
 * extend BaseRepository<typeof userPreferences>. Hand-rolled CRUD instead.
 */
@Injectable()
export class UserPreferencesRepository {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  async findByUserId(userId: string) {
    const rows = await this.db
      .select()
      .from(userPreferences)
      .where(eq(userPreferences.userId, userId))
      .limit(1);
    return rows[0] ?? null;
  }

  async createDefault(userId: string) {
    const rows = await this.db
      .insert(userPreferences)
      .values({ userId })
      .onConflictDoNothing()
      .returning();
    return rows[0] ?? null;
  }

  async updateByUserId(
    userId: string,
    patch: Partial<typeof userPreferences.$inferInsert>,
  ) {
    const rows = await this.db
      .update(userPreferences)
      .set({ ...patch, updatedAt: new Date() })
      .where(eq(userPreferences.userId, userId))
      .returning();
    return rows[0] ?? null;
  }
}
