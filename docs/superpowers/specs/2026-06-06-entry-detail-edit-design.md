# Entry Detail/Edit Pages — Design (Phase 2a+2b)

**Date:** 2026-06-06
**Status:** Approved
**Scope:** Phase 2a+2b of the Entry feature: detail/edit pages for part tests and
full tests, with the image-upload UI present but disabled (upload infrastructure
undecided). Builds on Phase 1
(`2026-06-06-entry-listing-improvements-design.md`).

## Context

`/entry` lists `data_entry_part_test` and `data_entry_full_test` (Supabase).
Phase 1 added thumbnails, server-side sorting, and audit columns. This phase
makes rows clickable: each opens a detail page where an **admin** edits every
business field. Audit fields (`id`, `version`, `created_by`, `created_at`,
`updated_by`, `updated_at`) are read-only. Heavy jsonb content
(`question_groups`, `all_test_ids`, `content_ids`, `knowledge_codes`,
`transcript_characters`) is **not editable** in this phase — later phases (2c
question-group editor, 2d full-test composer) own those.

Decisions made during brainstorming:

- **Upload destination undecided** → ship the media section UI with a disabled
  "Replace image" button (tooltip: upload not configured) and a typed
  `uploadMedia(file): Promise<MediaObject>` seam to plug in later (2b-infra).
- **Permissions: admin-only updates** (mirror the `/users` pattern —
  `user_profiles.role = 'admin'`). DB currently has SELECT-only policies, so
  this phase ships an UPDATE policy migration.
- **Architecture: two routes sharing a chrome** (approach A) — separate form
  components per test kind; shared layout, hooks, and media section.

## 1. Routes & navigation

- New routes: `/_authenticated/entry/part-tests/$id` and
  `/_authenticated/entry/full-tests/$id` (thin files importing feature
  components, per repo convention).
- Listing rows become clickable (whole row, `cursor-pointer`) and navigate to
  the matching detail route.
- Buttons:
  - **Save** — persist, stay on the page.
  - **Save & Finish** — persist, then return to the listing.
  - **Back** — return without saving (the only button for non-admins).
- "Return to the listing" = `router.history.back()` when the previous entry is
  the app's own `/entry` (preserves search params); otherwise
  `navigate({ to: '/entry' })`.
- Navigating away with a dirty form prompts a confirm dialog ("unsaved
  changes").

## 2. Data layer

`src/features/entry/hooks/`:

- `useTestDetail(kind, id)` — fetches one row (`select('*').eq('id', id).single()`),
  parsed by new zod detail schemas (`partTestDetailSchema`,
  `fullTestDetailSchema`): the list-schema fields plus `directions`,
  `ex_description`, `audio_time`, `start_part_order`, `end_part_order`,
  `flag_type`, `base_source`, `base_id`, `created_at`, `created_by`, and loose
  passthrough for the heavy jsonb columns (parsed as `z.unknown()`/loose — only
  `question_groups[].group_title` + question counts and
  `all_test_ids.length` are read, never edited).
- `useUpdateTest(kind)` — TanStack Query mutation doing a direct Supabase
  update with **optimistic concurrency**:

  ```
  update({ ...editedFields, version: loaded.version + 1,
           updated_by: currentUserEmail, updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('version', loaded.version)
    .select()
  ```

  Zero rows returned → someone else saved first → destructive toast with a
  "Reload" action (refetch detail, form resets). Success → invalidate the
  detail query and both listing query key roots.

## 3. DB migration (admin UPDATE policies)

The DB already has an `is_admin()` helper (used by the `user_profiles` admin
policies) — reuse it:

```sql
create policy "Admins can update part tests" on public.data_entry_part_test
  for update to authenticated
  using (is_admin()) with check (is_admin());

create policy "Admins can update full tests" on public.data_entry_full_test
  for update to authenticated
  using (is_admin()) with check (is_admin());
```

Applied via Supabase MCP
`apply_migration`; per project process, the SQL must also be copied to the
backend Flyway repo (see `db-migrations-flyway-canonical` memory).

## 4. UI

### Shared chrome — `EntryDetailLayout`

`src/features/entry/components/detail/entry-detail-layout.tsx`:

- Header: test name + `document_status` badge.
- Read-only audit panel: version, created_by/at, updated_by/at (formatted).
- Sticky footer: `Back` / `Save` / `Save & Finish` (Save buttons hidden for
  non-admins, disabled while pristine or submitting).
- Optional `sidebar` slot (part tests only).

### Part-test form — sections (react-hook-form + zod, shadcn fields)

- **Basics:** name (text, required), part (select PART_1–7), test_type
  (LISTENING/READING), level (select TOEIC_300–900), flag_type
  (PRACTICE/MINI).
- **Numbers:** total_question, start_part_order, end_part_order (integers);
  duration_in_second and audio_time as **millisecond** number inputs with a
  live `mm:ss` hint (the column stores ms despite its name).
- **Descriptions:** directions, ex_description (textareas).
- **Status:** document_status (select DRAFT/EDITING/PUBLISHED),
  content_access_type (free text input — no DB CHECK; current data only has
  `FREE`).
- **Source:** base_source, base_id (text).
- **Media:** cover, ex_image, audio — preview via `mediaUrl` (image thumb or
  file name), each with a disabled "Replace" button +
  tooltip "Upload chưa được cấu hình". Seam:
  `src/features/entry/data/upload.ts` exporting
  `uploadMedia(file: File): Promise<MediaObject>` that throws
  `UploadNotConfiguredError` — the UI imports the seam, not the error path,
  so 2b-infra is a drop-in.
- **Left sidebar (2c preview):** read-only list of `group_title — N câu` from
  `question_groups`. No interaction.

### Full-test form

Same chrome and sections minus part-specific fields: test_type (FTL/FTR/FT),
parent_test_type (SKILL_TEST/FULL_TEST), level, total_question,
duration_in_second (ms + hint), document_status, content_access_type,
base_source, base_id, cover media. The composer area shows a read-only count:
"`all_test_ids.length` bài test con — chỉnh sửa ở phase sau".

### Form validation (zod)

- name: non-empty trimmed string.
- enum selects constrained to the existing option lists in
  `features/entry/data/schema.ts` (reuse `partValues`, `levelValues`, etc.).
- numbers: nonnegative integers; empty input → null.
- All editable fields nullable where the DB column is nullable.

## 5. Permissions & states

- Role check: no client-side role hook exists yet — add
  `src/hooks/use-is-admin.ts`: TanStack Query over
  `supabase.from('user_profiles').select('role').eq('id', user.id).single()`
  (`user_profiles.id` IS the auth user id; users can read their own profile
  under existing RLS), returning `{ isAdmin, isLoading }`. While loading,
  render the form disabled. Non-admin: all inputs disabled, Save buttons
  hidden, Back only. (RLS remains the real enforcement; the hook is UX.)
- Loading: form-shaped skeleton. Fetch error: destructive alert + Retry.
- Unknown id (PGRST116 / no row): small not-found state with a link back to
  `/entry`.

## 6. Testing

- Unit: form zod schemas (required name, ms numbers, null handling);
  concurrency result mapping (0 rows → conflict error type).
- Component (vitest browser): part form renders part-only fields and full form
  renders full-only fields; Save disabled when pristine; non-admin renders
  disabled inputs without Save; media Replace button disabled with tooltip.
- Gates: `pnpm lint && pnpm build`; runtime verification in a real browser
  (login as admin → edit name → Save → version bumps, listing reflects the
  change; Finish returns to listing with prior filters).
- Known pre-existing failure stays excluded: `search-provider.test.tsx`.

## Out of scope

Real upload (2b-infra), question-group/question editing (2c), `all_test_ids`
composer (2d), create/delete tests, editing heavy jsonb, audit-field editing.
