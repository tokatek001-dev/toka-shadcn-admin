# "Góp ý tính năng" (Feature Feedback) Admin Page

**Date:** 2026-06-06
**Origin:** Agentation annotations `mq1vi1mc-f3fkii` / `mq1vi1qa-27fww2` — add a sidebar page "Góp ý tính năng": a listing of user-submitted feedback/bug reports from the mobile app with status NOT_STARTED / IN_PROGRESS / COMPLETED.

## Goal

A new admin page at `/feedback` listing user-submitted feedback with server-side pagination, content search, and status filtering; admins can change each item's status. The mobile app will submit feedback later (out of scope) — the table and its RLS are made ready for that.

## Current state

- No feedback table exists in the Supabase project (`nuktewpnwemvmqdmxued`); the mobile app has no feedback-submission feature yet.
- `public.is_admin()` (security definer) already exists from the /users work — reuse it.
- Established admin-page patterns: server-driven TanStack Table (`src/features/entry/`, `src/features/users/`), `useTableUrlState`, shared `TableSkeleton`, global mutation error toasts.
- Sidebar items translate via `t('nav.items.<title>')` with English titles as keys; translations live in `src/locales/{en,vi}/common.json`.

## Design

### 1. Database migration

New table `public.user_feedback`:

| column | type | notes |
|---|---|---|
| `id` | uuid PK | default `gen_random_uuid()` |
| `user_id` | uuid NOT NULL | FK → `public.user_profiles(id)` ON DELETE CASCADE |
| `content` | text NOT NULL | the feedback body |
| `status` | text NOT NULL | CHECK in (`NOT_STARTED`, `IN_PROGRESS`, `COMPLETED`), default `NOT_STARTED` |
| `created_at` | timestamptz NOT NULL | default `now()` |
| `updated_at` | timestamptz NOT NULL | default `now()` |

- RLS enabled. Policies:
  - `Admins can read all feedback` — SELECT to `authenticated` USING `is_admin()`
  - `Admins can update feedback` — UPDATE to `authenticated` USING/WITH CHECK `is_admin()`
  - `Users can submit their own feedback` — INSERT to `authenticated` WITH CHECK `auth.uid() = user_id`
  - `Users can read their own feedback` — SELECT to `authenticated` USING `auth.uid() = user_id`
- Index `user_feedback_status_created_at_idx` on `(status, created_at desc)`.
- Applied via Supabase MCP; SQL kept at `supabase/migrations/` AND copied to `python-mono-app/migrations/0033_user_feedback.sql` (numbered series is canonical for `user_*` tables).

### 2. Frontend — `src/features/feedback/`

```
features/feedback/
  components/
    feedback-table.tsx       # server-driven table (mirrors users-table)
    feedback-columns.tsx     # column defs
    feedback-status-action.tsx  # row dropdown: set status (3 radio items)
  data/
    schema.ts                # zod row schema + status values/labels/colors
  hooks/
    use-feedback-data.ts     # list query (direct PostgREST)
    use-feedback-mutations.ts# useUpdateFeedbackStatus
  index.tsx                  # page component
```

- **Route:** `src/routes/_authenticated/feedback/index.tsx`, search schema `{ page catch 1, pageSize catch 10, status: enum[] catch [], search: string catch '' }`.
- **Sidebar:** item `{ title: 'Feature Feedback', url: '/feedback', icon: MessageSquareHeart }` in the **General** group after Users. i18n: `nav.items."Feature Feedback"` → en `"Feature Feedback"`, vi `"Góp ý tính năng"`.
- **List query** (Entry pattern, no RPC):
  `supabase.from('user_feedback').select('*, user_profiles(display_name, avatar_url)', { count: 'exact' }).order('created_at', { ascending: false }).range(from, to)` + `.ilike('content', %search%)` + `.in('status', statuses)`. Zod-parses rows (embedded `user_profiles` may be null if profile missing). Query keys `['feedback', 'list', params]`, `keepPreviousData`.
- **Status mutation:** `update({ status, updated_at: new Date().toISOString() }).eq('id', id)`; invalidates `['feedback']`; success toast; errors via global handler.
- **Table:** manualPagination + manualFiltering, `pageCount = max(1, ceil(count/pageSize))`, `getRowId`, page-clamp guarded by `!isLoading` (lessons from the users table). Columns: submitter (avatar + display name), content (`LongText`, truncated), status badge (NOT_STARTED neutral / IN_PROGRESS sky / COMPLETED teal), created date, actions. Filters: content text search (`search`) + status facet, URL-synced via `useTableUrlState`. No row selection (no bulk actions in scope).
- **Status labels:** Not Started / In Progress / Completed (badge text in English, consistent with the rest of the admin UI).

### 3. Error handling & edge cases

- Non-admin: RLS returns only their own rows (none in admin UI context) — page simply shows what the caller may see; no special casing needed.
- Mutation failure: toast via existing global `handleServerError` (plain Error messages surface).
- Page-out-of-range after filtering: `ensurePageInRange` with the `!isLoading` guard.
- Empty table (until the app ships submission): standard "No results." row.

### 4. Verification

- `pnpm lint && pnpm build && pnpm test` green (users-suite conventions; component tests for the status action following the dialog-test mock pattern if practical).
- Live QA: insert a temp feedback row via SQL (as a real user id), see it on /feedback, search + status-filter it, change its status in the UI, verify in DB, delete the temp row.

## Out of scope

- Mobile app submission UI / API.
- Admin replies, notes, deletion, bulk actions.
- Email/auth.users data (display name + avatar from user_profiles suffice).
