# Users Page on Real `user_profiles` Data (Full CRUD)

**Date:** 2026-06-06
**Origin:** Agentation annotation on `/users` — "Ở danh sách này lấy từ bảng `user_profiles`" (this list should come from the `user_profiles` table).

## Goal

Replace the faker-seeded users list at `/users` with live data from the Supabase `user_profiles` table, and wire all dialogs (add, edit, invite, delete, multi-delete) to real backend operations.

## Current state

- `src/features/users/data/users.ts` generates 500 fake rows; dialogs call `showSubmittedData()` (no persistence).
- `user_profiles` columns: `id uuid (FK auth.users ON DELETE CASCADE)`, `display_name`, `nick_name`, `avatar_url`, `avatar_media_file jsonb`, `role text` (`user` / `admin` / `anonymous`), `created_at`, `updated_at`, `created_by`, `updated_by`.
- RLS only allows users to read/update **their own** row — listing requires new policies/RPC.
- Email lives in `auth.users`, not in `user_profiles`.
- A `handle_new_user` trigger on `auth.users` auto-creates the profile (display_name from `user_metadata`, role `user`, or `anonymous`).
- Established fetch pattern: `src/features/entry/hooks/use-full-tests-data.ts` (TanStack Query + `manualPagination` + URL-synced table state via `useTableUrlState`).

## Architecture (chosen: hybrid RPC + Edge Function)

List and profile edits go through Postgres (RLS/RPC); only operations that require the GoTrue admin API (create, invite, delete) go through one Edge Function.

### 1. Database migration

- `public.is_admin()` — `security definer`, `stable`, pinned `search_path`; returns whether the caller's `user_profiles.role = 'admin'`. `EXECUTE` granted to `authenticated`. Avoids recursive RLS.
- New policies on `user_profiles` (existing self-access policies untouched):
  - `Admins can read all profiles` — `FOR SELECT USING (is_admin())`
  - `Admins can update any profile` — `FOR UPDATE USING (is_admin()) WITH CHECK (is_admin())`
- RPC `admin_list_user_profiles(p_page int, p_page_size int, p_search text default null, p_roles text[] default null)`:
  - `security definer`; raises an exception when caller is not admin.
  - Joins `auth.users` for `email`.
  - `p_search` → `ilike` over `display_name`, `nick_name`, `email`.
  - `p_roles` → `role = any(p_roles)`.
  - Ordered `created_at desc`; paginated; returns rows plus `total_count` (window function).

> **Flyway note:** the database's schema history is managed by Flyway from another repo. The migration is applied here via the Supabase MCP, and the SQL must also be copied into the Flyway repo to keep it the source of truth.

### 2. Edge Function `admin-users` (service role, `verify_jwt: true`)

Every request: resolve caller from JWT, load caller's profile with the service client, require `role = 'admin'`.

| Action | Behavior |
|---|---|
| `create` | `auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { display_name } })`; the trigger creates the profile; then update profile `role` when `admin` is requested. |
| `invite` | `auth.admin.inviteUserByEmail(email)`; same role follow-up. |
| `delete` | Reject if `id` is the caller (no self-deletion); `auth.admin.deleteUser(id)`; FK cascade removes the profile. |

CORS handled as in the existing `ai-*` functions.

### 3. Frontend (`src/features/users/`)

- **Schema** (`data/schema.ts`): `{ id, displayName, nickName, email, avatarUrl, role: 'admin' | 'user' | 'anonymous', createdAt, updatedAt }`. Delete faker fixture `data/users.ts`. Role facet options: admin / user / anonymous. Status / username / phone columns are dropped (no real counterpart).
- **Query hook** `hooks/use-users-data.ts`, mirroring the Entry pattern: `supabase.rpc('admin_list_user_profiles', …)`, query key `['users', 'list', params]`, `placeholderData: keepPreviousData`, zod-parse rows.
- **Mutations** `hooks/use-users-mutations.ts`:
  - edit → direct `update` on `user_profiles` (admin policy)
  - create / invite / delete → `supabase.functions.invoke('admin-users')`
  - all invalidate `['users']`; errors surface via the existing global `handleServerError` / toast pattern.
- **Table** (`components/users-table.tsx`): `manualPagination: true`, `manualFiltering: true`, `pageCount = ceil(total_count / pageSize)`. Columns: avatar + display name, nick name, email, role badge, created date, row actions. Filters: one text search (name/email) + role facet, URL-synced via `useTableUrlState`. Route search schema (`src/routes/_authenticated/users/index.tsx`) updated to `{ page, pageSize, search, role[] }`.
- **Dialogs** (kept, rewired):
  - Add → email, password, display name, role → `create`
  - Edit → display name, nick name, role (email shown read-only)
  - Invite → email, role
  - Delete & multi-delete → real deletes; the signed-in admin's own row is non-deletable in the UI.

### 4. Error handling & edge cases

- Non-admin hitting `/users`: RPC raises → query error → table error state.
- Mutation failures: toast via existing global handler.
- Deleting the last rows of a page: existing `ensurePageInRange` recovers.
- Self-deletion blocked both in UI and in the Edge Function.

### 5. Verification

- `pnpm lint && pnpm build` must pass.
- Live check against `pnpm dev` using the `E2E_TEST_EMAIL` Supabase user — its profile must have `role = 'admin'` (verify/set during implementation).
- Existing colocated vitest tests must stay green. No new unit tests for the DB-backed hook (would require mocking supabase-js).

## Out of scope

- Password reset / email change for other users.
- `avatar_media_file` handling (only `avatar_url` is displayed).
- Migrating other pages off faker data.
