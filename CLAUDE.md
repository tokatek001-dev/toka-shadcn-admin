# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

Package manager: **pnpm**. Bundler: **Vite**. Tests run in real Chromium via `@vitest/browser-playwright`.

```bash
pnpm dev                    # Vite dev server
pnpm build                  # tsc -b && vite build (typecheck + bundle)
pnpm lint                   # eslint .
pnpm format                 # prettier --write .
pnpm knip                   # dead code / unused deps
pnpm test                   # vitest run, browser headless
pnpm test:watch             # vitest watch, browser headless
pnpm test:browser           # vitest with visible browser (debug)
pnpm test:coverage          # vitest run + v8 coverage
pnpm test:browser:install   # one-time: install Chromium for Playwright
```

Run a single test file: `pnpm test src/components/confirm-dialog.test.tsx`
Run by name pattern: `pnpm test -t "submits on enter"`

Before any handoff: `pnpm lint && pnpm build` must pass. Tests in `*.test.ts(x)` colocated with source.

## Architecture

Vite + React 19 + TypeScript SPA. Path alias `@/* → src/*`.

### Routing — TanStack Router (file-based, codegen)

- Routes live in `src/routes/`; the router compiles them into `src/routeTree.gen.ts` via `@tanstack/router-plugin/vite` (auto code-splitting on). **Never edit `routeTree.gen.ts` by hand** — it regenerates on dev/build.
- Route groups: `(auth)` and `(errors)` are pathless layout groups; `_authenticated/` is an auth-gated layout segment.
- `src/routes/clerk/` is a parallel auth tree from the upstream template. The project is migrating off Clerk to **Supabase auth** — prefer the non-`clerk/` routes and the `useAuthStore` zustand store when wiring new auth-gated flows. `.env.example` still references `VITE_CLERK_PUBLISHABLE_KEY` and `@clerk/react` is still a dependency; treat both as legacy until the migration lands.

### Feature modules

Domain code is organized under `src/features/<domain>/` (e.g. `users`, `tasks`, `chats`, `apps`, `settings`, `dashboard`, `auth`, `errors`). Standard shape:

```
features/<domain>/
  components/     # domain-specific components
  data/           # static seed / schemas / faker fixtures
  index.tsx       # the page component the route imports
```

Routes are thin — they import the feature's `index.tsx` and configure loaders/search params. Keep business logic in `features/`, not in `routes/`.

### Components

- `src/components/ui/` — shadcn primitives (style: `new-york`, base color `slate`). Several are RTL-customized; see README's "Customized Components" section before re-adding via `npx shadcn@latest add`.
- `src/components/` (top-level) — shared cross-feature components (sidebar layout, command menu, theme switch, data-table helpers, dialogs).
- `src/components/layout/` — app shell (sidebar, header, user nav).

### State & data

- **Server state:** TanStack Query (`QueryClient` configured in `src/main.tsx`). Global retry/refetch policy and a shared `handleServerError` mutation hook are set there — do not redefine per-query.
- **Client state:** Zustand stores in `src/stores/` (e.g. `auth-store.ts`).
- **Forms:** react-hook-form + `@hookform/resolvers` + zod schemas.
- **HTTP:** axios; 401/403 short-circuits retries in the query client.
- **Tables:** TanStack Table; shared helpers in `src/components/data-table/`.

### Providers

Wrapped in `src/main.tsx` in this order: `QueryClientProvider` → `ThemeProvider` → `FontProvider` → `DirectionProvider` → `RouterProvider`. RTL is first-class — preserve `dir` propagation when touching layout primitives.

### Styling

Tailwind v4 via `@tailwindcss/vite` (no `tailwind.config.js`; CSS-first config in `src/styles/index.css`). Use `cn()` from `@/lib/utils` to merge classes.

## Harness: `/build-feature`

This repo ships a multi-agent pipeline (Designer → Frontend → QA) defined in `.claude/workflows/build-feature.js` and exposed via the `/build-feature` slash command. Accepts a feature brief or a Figma URL.

- **Designer** is read-only; outputs a JSON spec (route, components, data model, states, acceptance criteria).
- **Frontend** must satisfy `pnpm lint && pnpm build` before handing off.
- **QA** spawns `pnpm dev` and drives Playwright via MCP (`mcp__plugin_playwright_playwright__*`); failures loop back to Frontend, max 2 retries.
- Auth-gated QA needs `E2E_TEST_EMAIL` / `E2E_TEST_PASSWORD` in `.env.local` (Supabase test user).
- Per-run artifacts in `.claude/runs/<run-id>/` (gitignored): `spec.json`, `impl-<n>.json`, `qa-<n>.json`, `screenshots/`.

When the user asks for a new feature end-to-end, prefer delegating to this workflow rather than doing design/frontend/QA inline. To extend the pipeline, edit prompts/schemas at the top of `.claude/workflows/build-feature.js` and the orchestration block at the bottom.

## Conventions

- Imports are auto-sorted by `@trivago/prettier-plugin-sort-imports` — run `pnpm format` rather than fighting the order manually.
- TypeScript target is strict; `typescript ~6.0` and `eslint 10`. `eslint-plugin-react-hooks` and `@tanstack/eslint-plugin-query` are active — heed their warnings.
- Knip is configured (`knip.config.ts`); unused exports will be flagged.
