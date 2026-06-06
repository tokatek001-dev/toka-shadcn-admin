# Entry Listing Improvements — Design

**Date:** 2026-06-06
**Status:** Approved
**Scope:** Phase 1 of the Entry (PartTest / FullTest) work. Listing only — row click
and the detail/edit pages are Phase 2 (separate spec).

## Context

`/entry` (`src/features/entry/`) is a read-only browser over two Supabase tables:

- `data_entry_part_test` — TOEIC part tests (tab `part_tests`, default)
- `data_entry_full_test` — TOEIC full tests (tab `full_tests`)

It already has server-side pagination, faceted filters, name search, skeleton and
empty states. This phase adds cover thumbnails, server-side sorting, and
`version` / `created_by` / `updated_by` columns.

Media files referenced by `cover.path` (e.g. `PUBLIC/MEDIA/TOEIC_ETS_2022_xxx.jpg`)
are hosted on the DOL CDN, **not** Supabase Storage (the project has no buckets).
Current base URL: `https://media.dolenglish.vn/` — expected to change later, so it
must be configurable.

## 1. Media URL helper

- New env var `VITE_MEDIA_BASE_URL` in `.env.example` (and `.env.local`), current
  value `https://media.dolenglish.vn/`.
- `mediaUrl(path)` in `src/features/entry/data/media.ts`:
  - returns `null` for null/empty path
  - normalizes the join so a leading `/` on the path or a missing trailing `/` on
    the base both produce a single-slash URL

## 2. Data layer

- `PART_TEST_SELECT` / `FULL_TEST_SELECT` add: `cover, version, created_by,
  updated_by`. Only `cover` is added from the jsonb columns — heavy jsonb
  (`question_groups`, `all_test_ids`, etc.) stays excluded.
- Zod schemas add:
  - `cover`: loose nullable object — `{ name?: string|null, path?: string|null }`
    (passthrough on other keys)
  - `version: number`, `created_by: string`, `updated_by: string` (NOT NULL in DB)
- `usePartTestsData` / `useFullTestsData` accept `sorting: { id: string, desc:
  boolean }` and apply `query.order(id, { ascending: !desc })`. Default stays
  `updated_at desc`.
- Sort state lives in URL search params on `/_authenticated/entry/`:
  `sortBy` (string) + `sortDesc` (boolean), shared between tabs like the existing
  filter keys. Invalid values `.catch()` back to the default.

## 3. UI — table columns (both tabs)

- **Cover column** (first data column): ~40×40 rounded thumbnail, `object-cover`.
  No cover / broken image → gray placeholder with an image icon (`onError`
  fallback, layout must not shift).
- **New columns:** `version` (number), `created_by`, `updated_by` (null → "–").
- **Sortable** via the existing `DataTableColumnHeader`: `name`,
  `total_question`, `duration_in_second`, `updated_at`, `version`.
  Server-side (`manualSorting: true`). Changing sort resets to page 1.
- Cover, `created_by`, `updated_by` are not sortable.

## 4. Edge cases

- `cover` present but `path` null/empty → placeholder.
- Image 404 → `onError` swaps to placeholder.
- Unknown `sortBy` in URL → falls back to `updated_at desc`.

## 5. Testing

- Unit tests for `mediaUrl` (join, null, slash normalization).
- Render test: thumbnail placeholder when cover is null.
- `pnpm lint && pnpm build` must pass before handoff.

## Out of scope (Phase 2)

Row click → detail navigation, detail/edit pages, image upload, question-group
sidebar, `all_test_ids` composition for full tests, Save/Finish actions.
