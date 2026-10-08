# `apps/web` — layered Next.js frontend

Next.js 15 (App Router) on React 19, Tanstack Query for server state,
Zustand for client UI state, Supabase auth, shadcn primitives. The
codebase is **layered**, but unlike the backend (which is layer-first),
the frontend is **feature-first with layers inside**.

```
app/<route>/page.tsx           thin route — composes feature components
   │
   ▼
features/<feature>/components/  presentational + container components
   │
   ▼
features/<feature>/hooks/       React Query / Zustand wrappers
   │
   ▼
features/<feature>/actions/     "use server" server actions
   │
   ▼
features/<feature>/api/         server-only fetchers → OctoFocusAI API
   │
   ▼
services/api (NestJS, separate process)
```

**Skipping a layer is the bug, not the shortcut.** Client components do
not call `fetch`. Server actions do not call the database. The api
folder does not import React.

---

## Directory map

```
apps/web/src/
├── app/                              App Router routes. Thin.
│   ├── layout.tsx                    Wires ThemeProvider + QueryProvider.
│   ├── (auth)/                       Login / register routes.
│   └── (app)/                        Authenticated shell — workspaces, projects, notes, canvas.
│
├── features/                         Feature-first colocation. One folder per bounded context.
│   └── <feature>/
│       ├── components/               Presentational + container components.
│       ├── hooks/                    use<Feature>(), useCreate<X>(), … — React Query wrappers.
│       ├── store/                    Zustand stores for client UI state (optional).
│       ├── actions/                  "use server" entry points called from client components.
│       ├── api/                      "server-only" HTTP calls to services/api.
│       ├── types/                    Feature-local TS types (Zod schemas live in @octofocus/shared).
│       └── constants/                Magic strings, query keys, defaults.
│
├── lib/                              Cross-feature primitives.
│   ├── api/
│   │   ├── base-response.ts          BaseResponse<T> + ActionResponse<T> contracts + helpers.
│   │   ├── server-fetch.ts           serverFetch<T>() — auth + unwrap + error.
│   │   └── action.ts                 runAction() — wrap server-action bodies.
│   ├── supabase/                     Browser + server Supabase clients.
│   ├── store/                        Cross-feature Zustand stores (rare — prefer per-feature).
│   └── utils.ts                      cn(), small utilities.
│
├── env/
│   ├── client.ts                     @t3-oss/env-nextjs — validates NEXT_PUBLIC_* at build time.
│   └── server.ts                     Server-only env (stub for now).
│
├── providers/                        App-shell providers.
│   ├── query-provider.tsx
│   └── theme-provider.tsx
│
└── components/                       Shared UI (sidebar, primitives, etc.).
    └── ui/                           shadcn-generated primitives. Don't hand-edit.
```

---

## Layer contracts

### `app/**/page.tsx` — route

**Allowed:**
- Auth gating (redirect on missing session)
- Prefetch via `queryClient.prefetchQuery(...)` + dehydrate + `<HydrationBoundary>`
- Compose feature components

**Not allowed:**
- Inline data fetching that bypasses `features/<f>/api`
- Inline styling beyond layout
- Business logic

### `features/<f>/components/*`

**Allowed:**
- JSX, presentation, local state
- Calling feature hooks (`useNotes`, `useCreateNote`, …)
- Calling server actions via the hook layer (not directly)

**Not allowed:**
- `fetch()` calls
- Direct imports from `features/<f>/api/` (server-only)
- Cross-feature deep imports — go through the other feature's `index.ts`

### `features/<f>/hooks/*`

**Allowed:**
- `useQuery` / `useMutation` wrappers
- Query-key construction (use feature constants)
- Optimistic updates / invalidation orchestration

**Not allowed:**
- JSX
- Direct HTTP — call the matching server action

### `features/<f>/actions/*` (`"use server"`)

**Allowed:**
- Validate the input
- Call one or more `features/<f>/api/*` functions
- Wrap the body in `runAction(...)` so the return is `ActionResponse<T>`
- `revalidatePath` / `revalidateTag` when needed

**Not allowed:**
- Direct DB access (we have a separate api service)
- React imports

### `features/<f>/api/*` (`import "server-only"`)

**Allowed:**
- Build the URL + body
- Call `serverFetch<T>(path, init)` which handles auth + unwrap
- Return the typed payload

**Not allowed:**
- React imports
- Caching policy (the caller — server action or RSC — owns that)

---

## State management

- **Server state** → React Query, in `features/<f>/hooks/`. Query keys are
  hierarchical and live in `features/<f>/constants.ts`:
  ```ts
  export const noteKeys = {
    all: ["notes"] as const,
    list: (workspaceId: string) => [...noteKeys.all, "list", workspaceId] as const,
    detail: (noteId: string) => [...noteKeys.all, "detail", noteId] as const,
  };
  ```
- **Client UI state** → Zustand, in `features/<f>/store/`. Use for
  ephemeral UI (sidebar open?, selected node id, drag state). Don't put
  server data here — that's React Query's job.
- **Form state** → `react-hook-form` + Zod resolver, for any form with
  3+ fields or non-trivial validation. Schemas come from
  `@octofocus/shared`.

---

## The response envelopes

We have **two** envelopes — one over the wire, one inside React.

### `BaseResponse<T>` — server-to-server (between web and api)

```jsonc
{
  "result":     <payload>,
  "statusCode": 200,
  "message":    "Success",
  "success":    true,
  "errorCode":  "NOT_FOUND",   // present on errors
  "extra":      { ... }
}
```

`lib/api/server-fetch.ts` unwraps this. Feature `api/` files return the
inner `result` directly.

### `ActionResponse<T>` — server-action-to-client

```ts
type ActionResponse<T> =
  | { success: true; data: T }
  | { success: false; message: string; errorCode?: string };
```

Discriminated union — client components narrow on `.success`. Wrap
server-action bodies in `runAction(() => ...)` from `lib/api/action.ts`
and thrown errors auto-convert to `{ success: false }`.

---

## Adding a new feature — step-by-step

Say you're adding a `comments` feature.

1. **Types** — `features/comments/types.ts` defines `Comment`, `CreateCommentInput`.
2. **Constants** — `features/comments/constants.ts` defines `commentKeys`.
3. **API** — `features/comments/api/comments-api.ts` (`"server-only"`):
   ```ts
   import { serverFetch } from "@/lib/api/server-fetch";
   export const listCommentsApi = (pageId: string) =>
     serverFetch<Comment[]>(`/v1/pages/${pageId}/comments`);
   ```
4. **Actions** — `features/comments/actions/comments-actions.ts` (`"use server"`):
   ```ts
   export async function listCommentsAction(pageId: string) {
     return runAction(() => listCommentsApi(pageId));
   }
   ```
5. **Hooks** — `features/comments/hooks/use-comments.ts`:
   ```ts
   export const useComments = (pageId: string) =>
     useQuery({
       queryKey: commentKeys.list(pageId),
       queryFn: async () => {
         const r = await listCommentsAction(pageId);
         if (!r.success) throw new Error(r.message);
         return r.data;
       },
     });
   ```
6. **Components** — `features/comments/components/comments-panel.tsx`
   uses `useComments`. No HTTP, no actions imported.
7. **Route** — `app/(app)/.../page.tsx` mounts `<CommentsPanel />`,
   optionally prefetches via `queryClient.prefetchQuery({queryKey: commentKeys.list(pageId), queryFn: () => listCommentsAction(pageId)})`.

---

## Local dev

```bash
pnpm --filter @octofocus/web dev          # next dev
pnpm --filter @octofocus/web typecheck    # tsc --noEmit
pnpm --filter @octofocus/web lint
pnpm --filter @octofocus/web build
```

Local dev requires a real Supabase session — sign in normally at
`/login` via magic link or Google. No bypass shortcut.

---

## Conventions

- **Server-only modules** at `features/<f>/api/*` always start with
  `import "server-only";` — protects against accidental client imports.
- **Action modules** at `features/<f>/actions/*` always start with
  `"use server";` — every exported function is treated as an action.
- **Query keys** are hierarchical and centralised in
  `features/<f>/constants.ts`. Don't sprinkle string literals.
- **Cross-feature imports** go through `features/<f>/index.ts` (a
  curated barrel). Don't reach into sibling features.
- **shadcn** primitives go in `components/ui/`. Don't hand-edit;
  re-run the generator instead.
- **No `any`.** If you genuinely don't know the shape, use `unknown` and
  narrow.

---

## Background

This layered structure landed in the frontend refactor (June 2026),
mirroring the backend refactor from earlier that month. The notes
feature is the canonical reference implementation; other features were
copied from it.
