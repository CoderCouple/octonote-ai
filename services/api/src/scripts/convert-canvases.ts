/**
 * One-off: converts every canvas still stored as a tldraw snapshot to an
 * octodraw document. Runs after the 0022 migration (which adds
 * `document_format` + `document_tldraw`), not inside it, so a bad document
 * can't fail a deploy.
 *
 *   pnpm --filter @octonote/api db:convert-canvases --dry-run   # counts + per-canvas stats, writes nothing
 *   pnpm --filter @octonote/api db:convert-canvases             # convert
 *   (deployed image: node dist/scripts/convert-canvases.js [--dry-run] [--batch=200])
 *
 * For each row with document_format <> 'octodraw' (standalone, project-owned,
 * notebook and soft-deleted canvases alike): document → document_tldraw
 * (unless a backup is already there), toOctodrawDocument(document) →
 * document, format → 'octodraw'. Idempotent and resumable: converted rows are
 * never selected again, and each update only applies if the row hasn't
 * changed since it was read (a concurrent save wins; the next run retries).
 * A row that fails to convert is logged and skipped. updated_at is left
 * alone so lists keep their order.
 */
import { and, asc, eq, gt, ne, sql } from "drizzle-orm";
import { isOctodrawDocument, toOctodrawDocument } from "@octonote/content/server";
import type { Database } from "../db/database.module";
import { canvases } from "../db/schemas/canvases";

export interface ConvertCanvasesOptions {
  dryRun?: boolean;
  batchSize?: number;
  log?: (line: string) => void;
}

export interface CanvasConversion {
  id: string;
  title: string;
  /** Records in the tldraw store that are shapes (0 for an empty document). */
  tldrawShapes: number;
  /** Octodraw items by type, e.g. { shape: 3, line: 2 }. */
  items: Record<string, number>;
}

export interface ConvertCanvasesResult {
  scanned: number;
  converted: number;
  /** Rows saved by someone else between read and write; picked up by the next run. */
  skipped: number;
  failed: { id: string; error: string }[];
  canvases: CanvasConversion[];
}

function tldrawShapeCount(document: unknown): number {
  const store = (document as { store?: Record<string, { typeName?: string }> } | null)?.store;
  if (!store || typeof store !== "object") return 0;
  return Object.values(store).filter((r) => r?.typeName === "shape").length;
}

function itemCounts(document: { items: { type: string }[] }): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const item of document.items) counts[item.type] = (counts[item.type] ?? 0) + 1;
  return counts;
}

export async function convertCanvases(db: Database, options: ConvertCanvasesOptions = {}): Promise<ConvertCanvasesResult> {
  const { dryRun = false, batchSize = 200, log = () => undefined } = options;
  const result: ConvertCanvasesResult = { scanned: 0, converted: 0, skipped: 0, failed: [], canvases: [] };
  let after = "";

  for (;;) {
    const rows = await db
      .select({
        id: canvases.id,
        title: canvases.title,
        document: canvases.document,
        documentTldraw: canvases.documentTldraw,
        // As text: Postgres keeps microseconds, a JS Date only milliseconds.
        updatedAt: sql<string>`${canvases.updatedAt}::text`,
      })
      .from(canvases)
      .where(and(ne(canvases.documentFormat, "octodraw"), gt(canvases.id, after)))
      .orderBy(asc(canvases.id))
      .limit(batchSize);
    if (rows.length === 0) break;
    after = rows[rows.length - 1]!.id;

    for (const row of rows) {
      result.scanned++;
      try {
        const alreadyOctodraw = isOctodrawDocument(row.document);
        const document = alreadyOctodraw ? row.document : toOctodrawDocument(row.document);
        const stats: CanvasConversion = {
          id: row.id,
          title: row.title,
          tldrawShapes: alreadyOctodraw ? 0 : tldrawShapeCount(row.document),
          items: itemCounts(document as { items: { type: string }[] }),
        };
        const summary = Object.entries(stats.items).map(([k, n]) => `${k}=${n}`).join(" ") || "empty";
        if (dryRun) {
          result.canvases.push(stats);
          result.converted++;
          log(`[dry-run] ${row.id} "${row.title}": ${stats.tldrawShapes} tldraw shapes → ${summary}`);
          continue;
        }
        const backup = row.documentTldraw ?? (alreadyOctodraw ? null : row.document);
        const updated = await db
          .update(canvases)
          .set({ document: document as never, documentTldraw: backup as never, documentFormat: "octodraw" })
          .where(and(eq(canvases.id, row.id), ne(canvases.documentFormat, "octodraw"), sql`${canvases.updatedAt}::text = ${row.updatedAt}`))
          .returning({ id: canvases.id });
        if (updated.length === 0) {
          result.skipped++;
          log(`skipped ${row.id}: changed while converting (or already converted); run again`);
          continue;
        }
        result.canvases.push(stats);
        result.converted++;
        log(`converted ${row.id} "${row.title}": ${stats.tldrawShapes} tldraw shapes → ${summary}`);
      } catch (err) {
        const error = err instanceof Error ? err.message : String(err);
        result.failed.push({ id: row.id, error });
        log(`FAILED ${row.id}: ${error}`);
      }
    }
  }
  return result;
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const batchArg = args.find((a) => a.startsWith("--batch="));
  const batchSize = batchArg ? Math.max(1, Number(batchArg.slice("--batch=".length)) || 200) : 200;
  if (!process.env.DATABASE_URL) {
    try {
      // Local runs (pnpm --filter @octonote/api …) read the root .env, like drizzle.config.ts.
      process.loadEnvFile("../../.env");
    } catch {
      // No .env: DATABASE_URL must come from the environment.
    }
  }
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is required.");

  const { drizzle } = await import("drizzle-orm/postgres-js");
  const { default: postgres } = await import("postgres");
  const schema = await import("../db/schema");
  const client = postgres(url, { max: 1, prepare: false, onnotice: () => undefined });
  try {
    const db = drizzle(client, { schema }) as unknown as Database;
    const r = await convertCanvases(db, { dryRun, batchSize, log: (l) => console.log(l) });
    console.log(
      `${dryRun ? "Dry run: " : ""}${r.scanned} tldraw canvases scanned, ${r.converted} ${dryRun ? "would be converted" : "converted"}, ${r.skipped} skipped, ${r.failed.length} failed.`,
    );
    if (r.failed.length) process.exitCode = 1;
  } finally {
    await client.end();
  }
}

if (require.main === module) {
  main().catch((err: unknown) => {
    console.error("Canvas conversion failed:", err);
    process.exit(1);
  });
}
