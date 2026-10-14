/**
 * Applies pending database migrations (services/api/drizzle) and exits.
 * Railway runs it as the pre-deploy step (railway.toml), so the database is
 * always migrated before a new API version takes traffic; if it fails, the
 * deploy stops and the running version stays up. Same journal as
 * `drizzle-kit migrate` (drizzle.__drizzle_migrations), so both can be used.
 */
import { join } from "node:path";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is required to run migrations.");
  const client = postgres(url, { max: 1, prepare: false, onnotice: () => undefined });
  try {
    const started = Date.now();
    await migrate(drizzle(client), { migrationsFolder: join(__dirname, "..", "drizzle") });
    console.log(`Migrations up to date (${Date.now() - started} ms).`);
  } finally {
    await client.end();
  }
}

main().catch((err: unknown) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
