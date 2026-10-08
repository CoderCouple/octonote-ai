# `services/api` — layered NestJS backend

NestJS 10 on Fastify, Drizzle ORM against Postgres (Supabase). The
codebase is **layered**: every feature flows through four narrow concerns
that never bypass each other.

```
HTTP request
   │
   ▼
Controller         (api/v1/controller/*)   thin HTTP adapter
   │
   ▼
Service            (service/*)             business logic
   │
   ▼
Repository         (db/repository/*)       typed Drizzle queries
   │
   ▼
DB schema          (db/schemas/*)          one file per bounded context
```

If you need to know **only one thing** before opening a PR: the controller
calls the service, the service calls the repository, the repository talks to
Drizzle. **Skipping a layer is the bug, not the shortcut.**

---

## Directory map

```
services/api/src/
├── main.ts                          Boot. Wires the global filter + interceptor.
├── auth/                            Supabase JWT guard, dev-bypass seed.
│
├── common/                          Cross-cutting. Imported anywhere.
│   ├── error/
│   │   ├── error-codes.ts           ErrorCode enum (stable wire strings).
│   │   ├── app-error.ts             AppError extends HttpException + code + extra.
│   │   ├── error-factory.ts         NotFound(), Forbidden(), BadRequest(), …
│   │   └── app-exception.filter.ts  Global @Catch() → BaseResponse JSON.
│   ├── interceptor/
│   │   └── response.interceptor.ts  Wraps successful returns in BaseResponse.
│   ├── change-events.service.ts     Audit log WRITER. Used by every service.
│   ├── email.service.ts             Resend wrapper.
│   ├── permissions.service.ts       Resource-level access resolver.
│   ├── slug.service.ts              Sticky-slug allocator (one slug per workspace).
│   ├── pagination.ts                PaginationParamsSchema + paginatedResult().
│   └── zod-validation.pipe.ts       Zod → 400 BadRequest pipe.
│
├── api/v1/                          HTTP layer.
│   ├── controller/                  15 thin controllers.
│   ├── request/                     Zod schemas (re-exported from @octonote/shared).
│   └── response/
│       ├── base.response.ts         BaseResponse<T> envelope + helpers.
│       └── *.response.ts            Wire DTOs + Domain→DTO mappers.
│
├── service/                         15 business-logic services.
│
├── db/
│   ├── database.module.ts           Drizzle client provider (DRIZZLE token).
│   ├── schema.ts                    Back-compat barrel re-export. New code: schemas/.
│   ├── schemas/                     10 per-domain table files.
│   │   ├── enums.ts                 All pgEnum() lives here.
│   │   ├── users.ts
│   │   ├── workspaces.ts            workspaces + members + invites
│   │   ├── projects.ts
│   │   ├── pages.ts                 pages + page_blocks
│   │   ├── canvases.ts              canvases + snapshots + assets + page_canvas_links
│   │   ├── sharing.ts               resource_shares + share_links
│   │   ├── agents.ts                agents + ai_runs
│   │   ├── audit.ts                 change_events
│   │   └── preferences.ts           user_preferences
│   └── repository/
│       ├── base.repository.ts       Generic findById / insert / updateById / deleteById.
│       └── *.repository.ts          One per table. Extends BaseRepository.
│
├── model/                           Domain types + row→model mappers.
│                                    Services and controllers import from here,
│                                    never directly from db/schemas/.
│
├── modules/                         NestJS feature modules + AppModule.
│                                    One module per bounded context. Each
│                                    module declares its controllers + services
│                                    + repositories and explicitly exports
│                                    services other modules consume.
│
└── (the legacy routes/ folder was removed in commits 2–5; do not recreate it)

test/
└── unit/                            vitest. 79 tests across model/common/service.
    ├── common/
    ├── model/
    └── service/                     One *.service.test.ts per service.
```

---

## Layer contracts

### Controller (`api/v1/controller/*.controller.ts`)

**Allowed:**
- Bind a route and HTTP method (`@Get`, `@Post`, …)
- Validate input with `ZodValidationPipe(SomeSchema)`
- Call **one** method on **one** service
- Map the returned domain model to a `*.response.ts` DTO
- Throw `AppError` subclasses (via the factory)

**Not allowed:**
- Direct DB access
- Business logic / multi-step workflows
- More than one service call per route (push the orchestration down)

Example:

```ts
@Patch(":id")
async update(
  @Param("id", IdParam) id: string,
  @Body(new ZodValidationPipe(WorkspaceUpdateSchema)) body: WorkspaceUpdate,
  @Req() req: AuthenticatedRequest,
): Promise<WorkspaceDto> {
  const workspace = await this.workspaces.update(id, body, req.user.id);
  return workspaceToDto(workspace);
}
```

### Service (`service/*.service.ts`)

**Allowed:**
- Business invariants (1:1 enforcement, "must keep at least one OWNER", etc.)
- Cross-repo orchestration
- Drizzle transactions when atomicity matters
- Audit logging via `ChangeEventsService.record()`
- Permission checks via `WorkspacesService.requireRole()` or
  `PermissionsService.require()`
- Throwing `AppError` subclasses via the factory (`NotFound`, `Forbidden`, …)

**Not allowed:**
- Raw HTTP concerns (status codes, headers, response shape)
- Direct `this.db.select()` calls outside of:
  - `MeService.sync` — needs a tx that spans `users` + `workspace_invites`
    + `workspaces` + `workspace_members`, documented in the file
  - `SharesService.create` — lookup of "is this email an existing user"
- Cross-domain joins should live in a repository, not be inlined here

### Repository (`db/repository/*.repository.ts`)

**Allowed:**
- Drizzle queries against **one bounded context** (one table or one cluster)
- Custom indexed queries (`findBySlug`, `listActiveFor`, `recordUse`, …)
- Extending `BaseRepository<TTable>` for generic CRUD

**Not allowed:**
- Business validation (move it up to the service)
- HTTP / presentation concerns
- Throwing `AppError` (return null / let the service decide)

### DB schema (`db/schemas/*.ts`)

**Allowed:**
- `pgTable()` definitions
- Indexes, unique constraints, partial indexes
- Foreign-key cascades

**Not allowed:**
- Queries (those live in repositories)

---

## The `BaseResponse` envelope

Every endpoint returns:

```jsonc
{
  "result":     <payload>,        // null on errors
  "statusCode": 200,
  "message":    "Success",
  "success":    true,
  "errorCode":  "NOT_FOUND",      // present on errors
  "extra":      { ... }           // optional, present when the service set it
}
```

- Successful returns are wrapped automatically by
  `common/interceptor/response.interceptor.ts`.
- Thrown errors are wrapped automatically by
  `common/error/app-exception.filter.ts`.
- **One exception:** `StreamableFile` (used for `/public/i/:slug` image bytes)
  passes through the interceptor unwrapped. If you add another binary endpoint,
  return a `StreamableFile`.

Controllers may explicitly return a pre-built `BaseResponse` (the interceptor
detects it and skips re-wrap), but the normal pattern is to **return the raw
payload and let the interceptor wrap it**.

---

## Error handling — `AppError` + factory

`common/error/error-factory.ts` exports six constructors. **Always throw via
these helpers** (not via Nest's built-in `NotFoundException` etc.) so every
error carries a stable `code` for the client.

```ts
import { NotFound, Forbidden, BadRequest, Conflict, ValidationError, Unauthorized } from "../common/error/error-factory";

if (!row) throw NotFound("Project not found.");
if (!canManage) throw Forbidden("Not allowed.");
if (slugTaken) throw Conflict("Slug already in use.");
```

`ErrorCode` enum lives at `common/error/error-codes.ts`. Add new codes here if
you need them; clients reference them by string.

---

## Adding a new feature — step-by-step

Say you're adding a `comments` feature on pages.

1. **Schema** — `db/schemas/comments.ts` defines a `comments` pgTable. Add
   `export * from "./comments";` to `db/schemas/index.ts`.

2. **Model** — `model/comment.model.ts` defines `Comment` (the domain type)
   and `toComment(row)` mapper.

3. **Repository** — `db/repository/comments.repository.ts` extends
   `BaseRepository<typeof comments>`. Add domain-specific queries
   (`listByPage`, etc.) as methods.

4. **Service** — `service/comments.service.ts` implements business logic.
   Inject the repo + `WorkspacesService` for role gating + `ChangeEventsService`
   for audit. Methods return **domain models**, not Drizzle rows.

5. **Request DTOs** — `api/v1/request/comment.request.ts` re-exports Zod
   schemas from `@octonote/shared` (or defines local ones for query params).

6. **Response DTOs** — `api/v1/response/comment.response.ts` defines
   `CommentDto` + `commentToDto(domain)`.

7. **Controller** — `api/v1/controller/comments.controller.ts`. One method per
   route. One service call per method. Map the result to a DTO.

8. **Module** — `modules/comments.module.ts` declares the controller +
   service + repo, imports `PagesModule` and `WorkspacesModule`, exports
   `CommentsService`. Add the module to `AppModule.imports`.

9. **Tests** — `test/unit/service/comments.service.test.ts` mocks the
   repository + workspaces service and tests every invariant.

10. **Migration** — `pnpm db:generate` from `services/api/`, then commit the
    new SQL under `drizzle/`. Apply with `pnpm db:migrate` against the dev
    DB, then again against prod when you deploy.

---

## Local dev

```bash
pnpm --filter @octonote/api dev          # nest start --watch
pnpm --filter @octonote/api typecheck
pnpm --filter @octonote/api test          # vitest run
pnpm --filter @octonote/api test:watch
pnpm --filter @octonote/api test:coverage
pnpm --filter @octonote/api db:generate   # produce migration from schema diff
pnpm --filter @octonote/api db:migrate    # apply pending migrations
pnpm --filter @octonote/api db:studio     # Drizzle Studio UI
```

Local dev hits real Supabase — every request needs a valid JWT
(or a `oft_…` CLI token). Use the web app at `/login` to obtain a
session, or generate a CLI token via `octonote login`.

---

## Environment variables

Required:

| Var | What | Where set |
|---|---|---|
| `DATABASE_URL` | Postgres connection string | Railway / `.env` |
| `SUPABASE_URL` | Supabase project URL | Railway / `.env` |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-side Supabase key (NOT the anon key) | Railway / `.env` |
| `WEB_ORIGIN` | Browser origin for CORS (e.g. `https://www.octonote.ai`) | Railway / `.env` |

Optional, but required for the features they enable:

| Var | Enables | Default |
|---|---|---|
| `ANTHROPIC_API_KEY` | `POST /v1/canvases/from-code` (code → diagram) and any future Claude-backed endpoint | — (feature throws on first call when unset; service still boots) |
| `ANTHROPIC_MODEL` | Override the default Claude model | `claude-opus-4-7` (pin to `claude-sonnet-4-6` for ~5× cheaper DSL generation) |
| `RESEND_API_KEY` | Transactional email (invites, share notifications) | — |
| `RESEND_FROM` | From-address for Resend emails | `Octonote <onboarding@resend.dev>` |
| `PUBLIC_APP_URL` | Used in email links + asset URL prefix | `https://www.octonote.ai` |
| `DB_POOL_SIZE` | Postgres connection pool size | `10` |
| `PORT` / `HOST` | Bind port + host (Railway injects PORT) | `4000` / `127.0.0.1` (local), `0.0.0.0` (when PORT injected) |

LLM cost note: `ANTHROPIC_MODEL=claude-sonnet-4-6` works well for DSL
generation and is significantly cheaper than Opus. Swap to Opus only
if you see meaningful quality loss on real prompts.

---

## Conventions

- **Prefixed IDs** everywhere. `usr_<uuid>`, `wsp_<uuid>`, `prj_<uuid>`,
  `pag_<uuid>`, `cnv_<uuid>`, `ast_<uuid>`, etc. Helpers in
  `@octonote/shared/ids.ts` (`generateId("prj")`, `buildIdFromUuid`).
- **Audit on writes.** Every state-changing service method records a
  `change_events` row via `ChangeEventsService.record()`.
- **No silent fallbacks.** If a service method receives an id that doesn't
  resolve, throw `NotFound`. Don't return `null`.
- **Permission gates before work.** The first line of every mutating service
  method is `await this.workspacesService.requireRole(actor, workspaceId, [...])`
  (or `PermissionsService.require(...)` for resource-level gates).
- **Don't extend `routes/`.** The legacy folder was removed. New controllers
  live under `api/v1/controller/`.

---

## Background

This layout landed across five commits in the layered-architecture refactor
(June 2026). The history at `6682c6a..6094771` walks through it feature by
feature, with the workspaces module (`bd1f9a2`) as the canonical example
others were copied from.
