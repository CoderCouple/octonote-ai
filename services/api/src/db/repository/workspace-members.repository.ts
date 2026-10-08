import { Inject, Injectable } from "@nestjs/common";
import { and, eq } from "drizzle-orm";
import { Database, DRIZZLE } from "../database.module";
import { users } from "../schemas/users";
import { workspaceMembers } from "../schemas/workspaces";
import { BaseRepository } from "./base.repository";

type Role = "OWNER" | "ADMIN" | "MEMBER";

interface MemberWithUser {
  member: typeof workspaceMembers.$inferSelect;
  user: { id: string; name: string; email: string; avatarUrl: string | null };
}

@Injectable()
export class WorkspaceMembersRepository extends BaseRepository<typeof workspaceMembers> {
  constructor(@Inject(DRIZZLE) db: Database) {
    super(db, workspaceMembers);
  }

  async findOne(workspaceId: string, userId: string) {
    const rows = await this.db
      .select()
      .from(workspaceMembers)
      .where(
        and(
          eq(workspaceMembers.workspaceId, workspaceId),
          eq(workspaceMembers.userId, userId),
        ),
      )
      .limit(1);
    return rows[0] ?? null;
  }

  async listByWorkspace(workspaceId: string): Promise<MemberWithUser[]> {
    return this.db
      .select({
        member: workspaceMembers,
        user: {
          id: users.id,
          name: users.name,
          email: users.email,
          avatarUrl: users.avatarUrl,
        },
      })
      .from(workspaceMembers)
      .innerJoin(users, eq(workspaceMembers.userId, users.id))
      .where(eq(workspaceMembers.workspaceId, workspaceId))
      .orderBy(workspaceMembers.createdAt);
  }

  async listOwners(workspaceId: string) {
    return this.db
      .select({ userId: workspaceMembers.userId })
      .from(workspaceMembers)
      .where(
        and(
          eq(workspaceMembers.workspaceId, workspaceId),
          eq(workspaceMembers.role, "OWNER"),
        ),
      );
  }

  async updateRole(workspaceId: string, userId: string, role: Role) {
    const rows = await this.db
      .update(workspaceMembers)
      .set({ role })
      .where(
        and(
          eq(workspaceMembers.workspaceId, workspaceId),
          eq(workspaceMembers.userId, userId),
        ),
      )
      .returning();
    return rows[0] ?? null;
  }

  async remove(workspaceId: string, userId: string) {
    await this.db
      .delete(workspaceMembers)
      .where(
        and(
          eq(workspaceMembers.workspaceId, workspaceId),
          eq(workspaceMembers.userId, userId),
        ),
      );
  }
}
