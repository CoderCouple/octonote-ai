/**
 * Real-Postgres test harness: PGlite (in-process, WASM) with the actual
 * migration applied, and the real services wired by hand. Only email is
 * faked, so tests can assert what was sent.
 */
import "reflect-metadata";
import { readFileSync } from "fs";
import { join } from "path";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { buildIdFromUuid } from "@octonote/shared";
import { ChangeEventsService } from "../../src/common/change-events.service";
import type { EmailService, ShareEmailInput } from "../../src/common/email.service";
import { PermissionsService } from "../../src/common/permissions.service";
import type { Database } from "../../src/db/database.module";
import { CanvasesRepository } from "../../src/db/repository/canvases.repository";
import { NotebooksRepository } from "../../src/db/repository/notebooks.repository";
import { PagesRepository } from "../../src/db/repository/pages.repository";
import { ProjectsRepository } from "../../src/db/repository/projects.repository";
import { SharingRepository } from "../../src/db/repository/sharing.repository";
import { WorkspaceMembersRepository } from "../../src/db/repository/workspace-members.repository";
import { WorkspacesRepository } from "../../src/db/repository/workspaces.repository";
import * as schema from "../../src/db/schema";
import { CanvasesService } from "../../src/service/canvases.service";
import { NotebookPlacement } from "../../src/service/lib/notebook-placement";
import { MeService } from "../../src/service/me.service";
import { NotebooksService } from "../../src/service/notebooks.service";
import { PagesService } from "../../src/service/pages.service";
import { ProjectsService } from "../../src/service/projects.service";
import { PublicService } from "../../src/service/public.service";
import { SharesService } from "../../src/service/shares.service";
import { SharingSettingsService } from "../../src/service/sharing-settings.service";
import { WorkspacesService } from "../../src/service/workspaces.service";

const MIGRATIONS_DIR = join(__dirname, "../../drizzle");

export class FakeEmail {
  sent: ShareEmailInput[] = [];
  failNext = false;
  async sendShareNotification(input: ShareEmailInput): Promise<void> {
    if (this.failNext) {
      this.failNext = false;
      throw new Error("smtp down");
    }
    this.sent.push(input);
  }
}

export async function createHarness() {
  const pg = new PGlite();
  for (const file of ["0000_init.sql"]) {
    const sql = readFileSync(join(MIGRATIONS_DIR, file), "utf8");
    for (const stmt of sql.split("--> statement-breakpoint")) {
      if (stmt.trim()) await pg.exec(stmt);
    }
  }
  const db = drizzle(pg, { schema }) as unknown as Database;

  const pagesRepo = new PagesRepository(db);
  const canvasesRepo = new CanvasesRepository(db);
  const projectsRepo = new ProjectsRepository(db);
  const notebooksRepo = new NotebooksRepository(db);
  const sharingRepo = new SharingRepository(db);
  const workspacesRepo = new WorkspacesRepository(db);
  const membersRepo = new WorkspaceMembersRepository(db);

  const email = new FakeEmail();
  const changeEvents = new ChangeEventsService(db);
  const permissions = new PermissionsService(db);
  const placement = new NotebookPlacement(permissions);
  const workspaces = new WorkspacesService(db, workspacesRepo, membersRepo, changeEvents);

  const services = {
    permissions,
    pages: new PagesService(pagesRepo, permissions, placement, workspaces, changeEvents),
    canvases: new CanvasesService(canvasesRepo, permissions, placement, workspaces, changeEvents),
    projects: new ProjectsService(
      projectsRepo,
      pagesRepo,
      canvasesRepo,
      permissions,
      placement,
      workspaces,
      changeEvents,
    ),
    notebooks: new NotebooksService(
      notebooksRepo,
      pagesRepo,
      canvasesRepo,
      projectsRepo,
      permissions,
      workspaces,
      changeEvents,
    ),
    shares: new SharesService(
      sharingRepo,
      permissions,
      email as unknown as EmailService,
      changeEvents,
    ),
    settings: new SharingSettingsService(sharingRepo, permissions, changeEvents),
    public: new PublicService(sharingRepo, pagesRepo, canvasesRepo, projectsRepo, notebooksRepo),
    me: new MeService(db),
  };

  let seq = 0;
  /** Signs a user in through MeService exactly as the app does (creates their workspace). */
  async function signIn(emailAddr: string) {
    seq += 1;
    const uuid = `00000000-0000-4000-8000-${String(seq).padStart(12, "0")}`;
    const me = await services.me.sync({
      id: buildIdFromUuid("usr", uuid),
      email: emailAddr,
      user_metadata: { name: emailAddr.split("@")[0] },
      app_metadata: {},
      aud: "authenticated",
      created_at: new Date().toISOString(),
    } as never);
    return {
      id: me.user.id,
      email: emailAddr,
      name: me.user.name,
      workspaceId: me.memberships[0]!.workspace.id,
    };
  }

  return { pg, db, email, signIn, ...services };
}

export type Harness = Awaited<ReturnType<typeof createHarness>>;

/** Resolves to the HTTP status a rejected promise carries (Nest or AppError). */
export async function statusOf(p: Promise<unknown>): Promise<number> {
  try {
    await p;
  } catch (err) {
    const e = err as { getStatus?: () => number; status?: number };
    return e.getStatus?.() ?? e.status ?? 500;
  }
  return 200;
}
