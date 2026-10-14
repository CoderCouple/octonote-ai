/**
 * Domain model for a user. Decoupled from the Drizzle row type so business
 * logic doesn't import database internals.
 */
import type { users } from "../db/schemas/users";

export interface User {
  id: string;
  name: string;
  email: string;
  avatarUrl: string | null;
  /** Octonote staff (admin pages). */
  isAdmin: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export function toUser(row: typeof users.$inferSelect): User {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    avatarUrl: row.avatarUrl,
    isAdmin: row.isAdmin,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}
