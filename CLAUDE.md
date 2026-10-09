# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository state

Port in progress (started 2026-10-08) from `~/Desktop/octo-focus-ai`, the prior overloaded MVP. Done: root configs, `packages/shared`, `packages/api-client`, `services/api` (incl. notebooks + Google Docs-style sharing/publishing, 58 tests green). Ported: `apps/web`, `apps/mobile` (fresh Expo SDK 57 app, not a copy of the old one). Git initialized 2026-10-08, no commits yet. Delete this section once the port lands.

## Product

**Octonote AI** — a shipping SaaS where notes and canvases are both first-class. Mobile (iOS + Android) is day-1 with a native feel.

### Entities (decided 2026-10-08)

| Entity | What it is |
|---|---|
| **Note** | A BlockNote document. Can stand alone. |
| **Canvas** | A tldraw board. Can stand alone. |
| **Project** | An eraser.io-style file: **exactly one note + one canvas**, viewed as notes / canvas / split. The project owns its pair — they never appear in the top-level Notes/Canvases lists. |
| **Notebook** | A folder-like collection holding any number of standalone notes, standalone canvases and projects. **An item is in at most one notebook** (or none). Deleting a notebook must not silently delete items — decide (move to root vs. block) when building it. |

Sidebar order: **Notes, Canvases, Projects, Notebooks.** Notes/Canvases list standalone items only.

### Sharing + publishing — Google Docs model (in v1)

**This is the most important feature in the product** (user, 2026-10-08). Build it end-to-end early, give `PermissionsService` the deepest test coverage (a bug leaks private notes), and treat the published reader page as a design priority — it's the first thing non-users see.

- **People with access:** Owner, then per-person **Editor** or **Viewer** by email. Non-users get a pending invite (email via Resend) that resolves on signup.
- **General access:** `restricted` (default) or `anyone_with_link` as viewer/editor. The link is the normal resource URL — no separate token table. Anonymous visitors can only view; editing requires sign-in.
- **Publish to web:** separate toggle → public read-only page at a slug URL, server-rendered by Next.js for OG previews. A note, canvas, project **or whole notebook** can be published.
- **Published state is inherited at read time**, not copied to children: a resource is publicly readable if it or any ancestor is published. Items added later to a published notebook become public automatically — the editor must show a "Published via <notebook>" badge so this is never a surprise.
- **Inheritance like Google Drive:** notebook → project → note/canvas. Highest grant wins.
- Applies to notes, canvases, projects, notebooks.
- **Not in v1:** Commenter role (arrives with comments), comments, highlights, votes, follows, password/expiring/max-use links.

## v1 MVP scope — hard limit

**v1 = notes editor + canvas + the organisation and sharing around them.** The list below is frozen; anything new goes to v2.

**IN SCOPE:**
- Notes editor (BlockNote) — standard blocks (paragraph, heading, list, todo, code, quote, divider, image) + **one custom block: `canvas-reference`**
- `canvas-reference` block — references a canvas page in the workspace. Renders a thumbnail (PNG snapshot stored on the canvas record) + canvas title. Clicking opens the canvas page. **Reference only, not inline rendering.** No tldraw instance inside the note.
- Canvas (tldraw) — default toolset
- Standalone notes, standalone canvases, projects (1 note + 1 canvas), notebooks
- Sharing + publishing (Google Docs model above)
- **View analytics for published pages** (added 2026-10-09, user decision): anonymous hourly views + daily unique visitors (`resource_views`; uniques via Plausible-style daily-rotating salt hash of account id or IP+UA, salt and hashes deleted daily), bots/link previews and the item's own owners/editors skipped, nothing about the visitor stored; owners + editors see a chart in the list's Analytics panel. No third-party analytics, no visitor tracking.
- Auth (Supabase: email + Google OAuth)
- Create / rename / delete / list for every entity
- Auto-save on debounce
- Mobile parity for both surfaces (reference block included)

**EXPLICITLY DEFERRED to v2+ (do not add in v1 even if "it's small"):**
- **Inline canvas block** (full tldraw rendered inside a note) — ships in v2 after we learn how users actually use the `canvas-reference` block. Do not add tldraw inside the BlockNote editor in v1.
- Mermaid blocks / diagrams-as-code
- AI diagram generation (Claude)
- Multiplayer (Yjs / Hocuspocus) — single-user with auto-save is enough
- Comments, highlights, votes, follows, Commenter role
- Export (PDF / PNG)
- Custom eraser-style DSL
- Mind maps, flashcards, charts, live code, infographics — all the overload-triggers from the prior MVP
- Desktop app, CLI
- Voice / transcription / meetings
- AI agents

The prior version (`~/Desktop/octo-focus-ai`) failed because the MVP had three products' worth of features. The v1 list above has already grown once (notebooks, standalone items, sharing); it is now frozen. Resist "while we're at it."

## Architecture (planned)

Monorepo managed with pnpm workspaces + Turborepo.

```
apps/
  web          Next.js 15 + React 19 + App Router + TanStack Query
               Hosts notes editor (BlockNote) + canvas (tldraw).
               Also hosts marketing landing page.
               Deployed to Vercel.
  mobile       Expo + expo-router + NativeWind + Supabase + EAS
               Editor and canvas rendered via Expo DOM (React web
               components inside native screens — not WebView).
services/
  api          NestJS 10 + Fastify + Drizzle + Postgres (Supabase).
               Layered: controller → service → repository → db/schemas.
               v1 endpoints: auth, workspaces, pages (note + canvas), CRUD.
               No AI, no multiplayer WS server, no exports, no transcription in v1.
               Deployed to Railway.
packages/
  shared       Zod schemas + ID helpers (ported from octo-focus-ai as-is)
  api-client   Typed client for services/api — imported by web and mobile
supabase/      SQL migrations + minimal RLS. Supabase = identity + storage
               + Postgres. Business logic lives in services/api, never in RLS.
```

### Why a dedicated backend (`services/api`), not Supabase-only

Even for v1 (no multiplayer, no AI), a dedicated backend is worth it because business logic buried in RLS policies and Edge Functions becomes unreadable fast. Supabase stays as identity + storage + Postgres; `services/api` owns workspace/page CRUD, authorization, auditing. The frontend talks to `services/api` for everything except auth session management and direct file uploads to Supabase Storage.

### Why NestJS (not Hono, not Express)

Carrying forward from `octo-focus-ai` where the layered pattern is already battle-tested: controller → service → repository → db/schemas, with cross-cutting primitives (BaseResponse envelope, error codes, audit log, permissions, slug allocator, Zod validation pipe, pagination). 79 unit tests already exist. Rewriting this on Hono adds weeks of work with no v1 benefit.

### Reference codebase to port from

`/Users/suniltiwari/Desktop/octo-focus-ai` holds the prior overloaded MVP. Approach: **fresh `octonote-ai` repo, port stable pieces, strip overload.**

**Port forward (keep):**
- `packages/shared` — Zod schemas + ID helpers (direct copy, rename `@octofocus/*` → `@octonote/*`)
- `packages/api-client` — typed client for the API
- `services/api` — the full NestJS layered backend including 79 unit tests, auth, workspaces, pages, permissions, audit log, slug allocator, pagination, BaseResponse envelope, error framework
- `apps/mobile` — Expo + expo-router + BlockNote-in-Expo-DOM + Supabase + NativeWind + EAS build config
- `apps/web` — Next.js 15 + React 19 + BlockNote + tldraw + Tailwind + shadcn + Supabase auth + the marketing landing page shell

**Strip during port (do NOT bring forward):**
- All AI/agent code: `packages/ai`, AI endpoints in services/api, AI-related BlockNote blocks
- All meeting/voice code: Deepgram session tokens, ElevenLabs, meetings module in services/api, mobile recording screens
- `packages/diagrams` — the eraser DSL parser (v2 feature; stays in octo-focus-ai as reference)
- `packages/cli` — not v1
- `apps/desktop` — not v1
- Visualization libraries beyond tldraw: `mermaid`, `mind-elixir`, `@antv/infographic`, `recharts`, `react-live`, `react-quizlet-flashcard` — delete deps
- Custom BlockNote blocks beyond the standard set (keep: paragraph, heading, list, todo, code, quote, divider, image. Delete: anything AI/mermaid/mind-map/flashcard/chart-related)
- Marketing landing's 6 animated use-case sections — keep hero + waitlist, defer the rest

Expected port effort: ~3–4 days of focused deletion + rename + wiring.

### Mobile strategy — native shell + WebView editors (Notion model)

Decided 2026-10-08, following the prior app's final commit (which replaced its Expo DOM spike): navigation, lists, sign-in, notebooks and headers are native (Expo Router native tabs + native stacks); the note/canvas/project editors are the web app's focus routes in a `react-native-webview`. One editor codebase.

- **Auth handoff:** the app opens `${WEB_URL}/embed/enter?to=<path>#at=…&rt=…`; tokens ride the URL fragment (never sent to servers). `/embed/enter` calls `supabase.auth.setSession`, strips the fragment, and replaces itself with `to` (validated by `safeNext` — keep that check).
- **In-app detection:** the WebView appends `OctonoteApp` to its user agent; web components hide duplicate chrome (e.g. `BackLink`) when they see it. Don't rely on `window.ReactNativeWebView` — Android only injects it when `onMessage` is set.
- **Mobile sign-in is email + 6-digit code** (`verifyOtp`), not magic links: deep links back from mail apps are fragile, and Expo Go has no WebCrypto for PKCE. The same Supabase email carries both the web link and the code.
- Expo SDK 57, runs in **Expo Go** (no custom native modules yet). No NativeWind — plain StyleSheet + `usePalette()` light/dark.

## Locked technology decisions

| Area | Choice | Why |
|---|---|---|
| Web framework | **Next.js 15 (App Router) + React 19 + TypeScript** | Already working in octo-focus-ai (zero migration cost). SSR benefits for marketing landing + future share pages. Mobile is a separate app, so framework choice doesn't affect it. |
| Data fetching | TanStack Query | Standard client-side cache / retries / optimistic updates. Server components for public routes, Query for client. |
| Styling | Tailwind CSS 4 + shadcn/ui + Radix | Already in use in octo-focus-ai. Monochrome design language. |
| Mobile | Expo SDK 57 + Expo Router (native tabs/stacks) + WebView editors | Native shell, one editor codebase; runs in Expo Go |
| Backend service | **NestJS 10 + Fastify + Drizzle** (in `services/api`) | Carried forward from octo-focus-ai where the layered pattern is already proven. Deployed to Railway. |
| Database + auth + storage | Supabase | Postgres + auth (identity) + storage. Frontend goes through `services/api`, not Supabase SDK, for business data. |
| Multiplayer server | ~~Hocuspocus~~ | **Deferred to v2.** No persistent WS server in v1. |
| Doc editor | **BlockNote** (built on Tiptap) | Notion-style block-first API out of the box; prior version shipped this successfully. Don't use raw Tiptap. |
| Freeform canvas | **tldraw** | Chosen for aesthetic quality — cleaner "SaaS product" look vs Excalidraw's hand-drawn sketchy aesthetic. Free with watermark during private beta; buy Business license at public launch (~$6k/yr tier at time of writing — verify current pricing). |
| Diagrams-as-code | ~~Mermaid~~ | **Deferred to v2.** Not in v1. |
| Multiplayer | ~~Yjs~~ | **Deferred to v2.** v1 is single-user with debounced auto-save. |
| AI | ~~Anthropic Claude~~ | **Deferred to v2.** No AI in v1. |

### Why tldraw (not Excalidraw)

User has a strong aesthetic preference for tldraw's clean modern look over Excalidraw's hand-drawn sketchy aesthetic. For a serious SaaS product the visual polish of tldraw matches the positioning better. Licensing: ship on free tier (with watermark) during private beta, buy Business license at public launch. Revisit a custom canvas build only if licensing becomes expensive relative to revenue — do not pre-optimize.


## Design system — one source of truth

`packages/design-tokens/src` defines every color, font, type size, radius, shadow and easing for web **and** mobile. Never hard-code a hex/rgba in a component or in `globals.css`.

- **Light = Notion:** pure white surfaces (page, sidebar, cards, popovers all `#FFFFFF`); structure from thin warm-gray borders; gray tints only for hover/selection/placeholders. Text `#37352F`.
- **Dark = Endel:** near-black `#0A0A0B`, soft white "aura" glow (`--aura-*`, transparent in light) + grain on marketing.
- **Monochrome.** The only hue is red, for destructive actions. Font: Inter (what Notion's UI font is based on).
- Semantic names follow shadcn (`background`, `muted-foreground`, …) plus `foreground-strong`, `foreground-subtle`, `surface-*`, `canvas-*`, `orb-*`, `aura-*`.
- Web: `pnpm --filter @octonote/design-tokens build` regenerates the committed `tokens.css` (CSS vars + Tailwind `@theme`), imported by `apps/web/src/app/globals.css`. Its test fails if `tokens.css` is stale or any text/surface pair drops below WCAG AA.
- Mobile: `apps/mobile/src/lib/theme.ts` reads `themes` from the package directly.
- Marketing feature demos (`apps/web/src/app/(marketing)/_components/demos`) animate the *real* features via `useDemoStep` (pauses off-screen, honors reduced motion).

## Data model principles

- Tables: `notebooks`, `projects`, `pages` (notes), `canvases`, `resource_shares`, plus workspaces/users/preferences/audit.
- `pages` and `canvases` carry `workspace_id` and nullable `project_id` / `notebook_id`. **At most one of those two is set** (DB check constraint): project-owned items live via the project, not a notebook. Partial unique indexes keep a project to one live page and one live canvas.
- `projects.notebook_id` is nullable; projects can sit in a notebook.
- Sharing columns (`link_access`, `link_role`, `published`, `public_slug`) live on each shareable table; per-person grants live in `resource_shares`.
- Notes can embed canvases via the `canvas-reference` block (one-way link).
- v1 content storage is JSON (BlockNote document for notes, tldraw snapshot for canvases) saved on debounce. No Yjs in v1.
- **tldraw license:** v5+ hides the canvas after 5s on non-localhost domains without `NEXT_PUBLIC_TLDRAW_LICENSE_KEY`. Get the free watermarked key before any deployed beta.

## Commands

```bash
pnpm install
pnpm typecheck                                   # all packages (api includes tests)
pnpm --filter @octonote/shared build             # api imports shared's dist/ — rebuild after changing shared
pnpm --filter @octonote/api dev                  # API on :4000, reads ../../.env
pnpm --filter @octonote/api test                 # all api tests
pnpm --filter @octonote/api exec vitest run test/integration/sharing.test.ts   # one file
pnpm --filter @octonote/api exec vitest run -t "highest grant wins"           # one test
pnpm --filter @octonote/api db:generate          # new migration after editing db/schemas
pnpm --filter @octonote/api db:migrate           # apply to DATABASE_URL
```

### Running locally (full stack)

```bash
supabase start                                   # needs Docker Desktop; local Postgres + auth + storage + Mailpit
pnpm --filter @octonote/api db:migrate           # app tables (Drizzle); storage bucket comes from supabase/migrations
pnpm --filter @octonote/shared --filter @octonote/api-client build
pnpm --filter @octonote/api dev                  # :4000
pnpm --filter @octonote/web dev                  # :3000
```

Root `.env` (API) and `apps/web/.env.local` (Next only reads its own folder) hold the local Supabase values from `supabase status -o env`. Magic-link emails land in Mailpit at http://127.0.0.1:54324; Supabase Studio is http://127.0.0.1:54323.

Phone / emulator testing uses the Mac's LAN IP everywhere (root `.env`, `apps/web/.env.local` incl. `LAN_HOST`, `apps/mobile/.env`, and `auth.external_url` + redirect URLs in `supabase/config.toml` — `external_url` must end in `/auth/v1`). Run the web app with `pnpm --filter @octonote/web dev -H 0.0.0.0` and the mobile app with `pnpm --filter @octonote/mobile start --lan`, then open `exp://<LAN-IP>:8081` in Expo Go. The IP changes with the network (office ↔ home): run `pnpm dev:ip` (`scripts/dev-ip.mjs`) to rewrite all of those, then restart supabase/api/web/expo.

API tests under `test/integration/` run against real Postgres in-process (PGlite) with the actual migration applied — no Docker needed. Add new sharing/permission tests there, not as mocked unit tests.

## API structure notes

- **Every read/write of a note, canvas, project or notebook goes through `PermissionsService.require(userId | null, {kind, id}, action)`** — never gate on workspace membership alone, or shared users get 404s. Workspace-membership checks (`WorkspacesService.requireRole`) are only for workspace-level lists/creates.
- Actions: `view` (viewer), `edit` + `share` (editor), `manage` = general access, publish, move, delete (owner).
- `GET /pages/:id`, `/canvases/:id`, `/projects/:id`, `/notebooks/:id` use `OptionalSupabaseAuthGuard` so "anyone with the link" works signed-out; all other routes use `SupabaseAuthGuard`.
- Public reads (`/public/:slug`, `/public/:slug/:kind/:id`) are unauthenticated; `PublicService.getChild` verifies the item is inside the published root — keep that check.
- `CoreModule` (global) provides all repositories and cross-cutting services; `FeaturesModule` holds controllers + feature services. Don't re-register providers per module.
- Fastify body limit is 10MB (autosave sends whole documents).

## Original port plan (steps 1–3 done; web + mobile still to do — note they now need notebooks, sharing UI and /pub pages, which this list predates)

1. Initialize `octonote-ai` with `pnpm` + Turborepo + base configs (`turbo.json`, `pnpm-workspace.yaml`, `tsconfig.base.json`, `.prettierrc.json`, `.gitignore`) — copy these from `octo-focus-ai` and update names.
2. Port `packages/shared` → rename package to `@octonote/shared`, no logic changes.
3. Port `services/api`:
   - Copy wholesale as `@octonote/api`
   - Delete modules/controllers/services/schemas related to: AI, agents, meetings, voice/transcription, diagrams
   - Keep: auth, workspaces, pages (notes + canvases), permissions, audit, slugs, pagination, BaseResponse, error framework
   - Run existing tests, keep what still passes, delete tests for deleted features
4. Port `packages/api-client` → regenerate against the trimmed API surface.
5. Port `apps/mobile` → rename, delete meeting/recording screens, keep editor + canvas screens + auth + navigation.
6. Port `apps/web`:
   - Copy wholesale as `@octonote/web`
   - Delete overload: mermaid/mind-elixir/flashcard/infographic/recharts/react-live code, custom AI blocks, meeting UI
   - Trim deps in `package.json` accordingly
   - Keep: BlockNote editor, tldraw canvas, auth flow, workspace/page UI, marketing hero + waitlist
7. Point everything at new Supabase project + new Vercel + Railway + EAS projects.
8. Build the `canvas-reference` custom BlockNote block (web + mobile):
   - Server: canvas record stores a `thumbnail_url` (PNG snapshot regenerated on canvas save, uploaded to Supabase Storage)
   - Block schema: `{ type: 'canvasReference', props: { canvasId: string } }`
   - Renders: thumbnail + title + click → navigate to canvas page
   - Slash menu entry: "/canvas" opens a picker of workspace canvases
   - **Hard rule:** this block does NOT render tldraw inline. If a future session is tempted, that's the inline-canvas feature which is v2.

## Memory

Durable product-level context lives in `/Users/suniltiwari/.claude/projects/-Users-suniltiwari-Desktop-octonote-ai/memory/` (auto-loaded index at `MEMORY.md`). The product-direction memory there is authoritative if it conflicts with this file; update both together.
