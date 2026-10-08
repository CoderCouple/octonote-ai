import { Inject, Injectable } from "@nestjs/common";
import { eq } from "drizzle-orm";
import { Database, DRIZZLE } from "../database.module";
import { users } from "../schemas/users";
import { BaseRepository } from "./base.repository";

@Injectable()
export class UsersRepository extends BaseRepository<typeof users> {
  constructor(@Inject(DRIZZLE) db: Database) {
    super(db, users);
  }

  async findByEmail(email: string) {
    const rows = await this.db
      .select()
      .from(users)
      .where(eq(users.email, email))
      .limit(1);
    return rows[0] ?? null;
  }
}
