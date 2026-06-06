# Entry Listing Improvements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add cover thumbnails, server-side sorting (persisted in URL search params), and `version` / `created_by` / `updated_by` columns to both Entry listing tabs (`part_tests`, `full_tests`).

**Architecture:** The Entry feature (`src/features/entry/`) reads two Supabase tables via TanStack Query hooks and renders TanStack tables with URL-driven state (`useTableUrlState`). We extend the shared URL-state hook with optional sorting support, widen the Supabase SELECT + zod schemas, add a `mediaUrl` helper (CDN base from `VITE_MEDIA_BASE_URL`), and a reusable `EntryCoverCell` thumbnail component.

**Tech Stack:** React 19, TanStack Router/Query/Table, zod v4, Supabase JS, Tailwind v4, Vitest browser mode (`vitest-browser-react`).

**Spec:** `docs/superpowers/specs/2026-06-06-entry-listing-improvements-design.md`

**Branch:** `feature/entry-listing-improvements`

**Pre-existing dirty file:** `src/features/users/components/users-delete-dialog.test.tsx` is modified in the working tree and does NOT belong to this work. Never `git add` it; always stage files explicitly by path.

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `.env.example` | Modify | Document `VITE_MEDIA_BASE_URL` |
| `.env.local` | Modify (gitignored) | Set the real CDN base URL |
| `src/features/entry/data/media.ts` | Create | `mediaUrl(path)` join helper |
| `src/features/entry/data/media.test.ts` | Create | Unit tests for `mediaUrl` |
| `src/features/entry/data/schema.ts` | Modify | Add `cover`/`version`/`created_by`/`updated_by` to schemas + SELECTs; `sortableEntryColumns` |
| `src/hooks/use-table-url-state.ts` | Modify | Optional sorting config → `sorting`/`onSortingChange` backed by URL |
| `src/hooks/use-table-url-state.test.ts` | Modify | Tests for the sorting extension |
| `src/features/entry/hooks/use-part-tests-data.ts` | Modify | Accept optional `sorting`, apply `.order()` |
| `src/features/entry/hooks/use-full-tests-data.ts` | Modify | Same as above |
| `src/features/entry/components/entry-cover-cell.tsx` | Create | Thumbnail with broken-image/placeholder fallback |
| `src/features/entry/components/entry-cover-cell.test.tsx` | Create | Placeholder + render tests |
| `src/features/entry/components/entry-columns-part-tests.tsx` | Modify | Cover column, new columns, enable sorting |
| `src/features/entry/components/entry-columns-full-tests.tsx` | Modify | Same as above |
| `src/routes/_authenticated/entry/index.tsx` | Modify | `sortBy`/`sortDesc` search params |
| `src/features/entry/components/part-tests-table.tsx` | Modify | Wire sorting state → hook + table |
| `src/features/entry/components/full-tests-table.tsx` | Modify | Same as above |

---

### Task 1: `mediaUrl` helper + env var

**Files:**
- Modify: `.env.example`
- Modify: `.env.local` (gitignored — local only)
- Create: `src/features/entry/data/media.ts`
- Create: `src/features/entry/data/media.test.ts`

- [ ] **Step 1: Add env var to `.env.example` and `.env.local`**

Append to `.env.example` (committed):

```bash
# Base URL for media files referenced by data_entry tables (cover.path etc.)
VITE_MEDIA_BASE_URL=
```

Append the real value to `.env.local` (NOT committed — gitignored):

```bash
grep -q VITE_MEDIA_BASE_URL .env.local || echo 'VITE_MEDIA_BASE_URL=https://media.dolenglish.vn/' >> .env.local
```

- [ ] **Step 2: Write the failing tests**

Create `src/features/entry/data/media.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { mediaUrl } from './media'

describe('mediaUrl', () => {
  it('joins base and path with a single slash', () => {
    expect(mediaUrl('PUBLIC/MEDIA/a.png', 'https://cdn.example.com/')).toBe(
      'https://cdn.example.com/PUBLIC/MEDIA/a.png'
    )
  })

  it('normalizes a leading slash on the path', () => {
    expect(mediaUrl('/PUBLIC/MEDIA/a.png', 'https://cdn.example.com/')).toBe(
      'https://cdn.example.com/PUBLIC/MEDIA/a.png'
    )
  })

  it('normalizes a missing trailing slash on the base', () => {
    expect(mediaUrl('PUBLIC/MEDIA/a.png', 'https://cdn.example.com')).toBe(
      'https://cdn.example.com/PUBLIC/MEDIA/a.png'
    )
  })

  it('returns null for null, undefined, or empty path', () => {
    expect(mediaUrl(null, 'https://cdn.example.com/')).toBeNull()
    expect(mediaUrl(undefined, 'https://cdn.example.com/')).toBeNull()
    expect(mediaUrl('   ', 'https://cdn.example.com/')).toBeNull()
  })

  it('returns null when the base URL is missing', () => {
    expect(mediaUrl('PUBLIC/MEDIA/a.png', undefined)).toBeNull()
    expect(mediaUrl('PUBLIC/MEDIA/a.png', '')).toBeNull()
  })
})
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `pnpm test src/features/entry/data/media.test.ts`
Expected: FAIL — `media.ts` does not exist / `mediaUrl` is not exported.

- [ ] **Step 4: Write the implementation**

Create `src/features/entry/data/media.ts`:

```ts
/**
 * Resolve a media `path` stored in the data_entry tables (e.g.
 * `PUBLIC/MEDIA/foo.png`) against the media CDN.
 *
 * The base URL comes from `VITE_MEDIA_BASE_URL` — the CDN host is expected
 * to change, so never hardcode it elsewhere. Returns `null` when either the
 * path or the base is missing, so callers can render a placeholder.
 */
export function mediaUrl(
  path: string | null | undefined,
  base: string | undefined = (import.meta.env as Record<string, string | undefined>)
    .VITE_MEDIA_BASE_URL
): string | null {
  if (!path || path.trim() === '') return null
  if (!base || base.trim() === '') return null
  const cleanBase = base.trim().replace(/\/+$/, '')
  const cleanPath = path.trim().replace(/^\/+/, '')
  return `${cleanBase}/${cleanPath}`
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm test src/features/entry/data/media.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 6: Commit**

```bash
git add .env.example src/features/entry/data/media.ts src/features/entry/data/media.test.ts
git commit -m "feat(entry): add mediaUrl helper backed by VITE_MEDIA_BASE_URL"
```

---

### Task 2: Schema + SELECT additions

**Files:**
- Modify: `src/features/entry/data/schema.ts`

- [ ] **Step 1: Add the media object schema and new row fields**

In `src/features/entry/data/schema.ts`, insert after the `fullDocumentStatusValues` block (line ~38) :

```ts
// Media objects (cover, audio, ex_image) are loose jsonb blobs; we only care
// about `path` (CDN-relative) and `name` here. Extra keys pass through.
export const mediaObjectSchema = z
  .looseObject({
    name: z.string().nullable().optional(),
    path: z.string().nullable().optional(),
  })
  .nullable()
export type MediaObject = z.infer<typeof mediaObjectSchema>
```

Then add these four fields to **both** `partTestSchema` and `fullTestSchema` (before `updated_at`):

```ts
  cover: mediaObjectSchema,
  version: z.number(),
  created_by: z.string(),
  updated_by: z.string(),
```

(`version`, `created_by`, `updated_by` are NOT NULL in both tables, so no `.nullable()`.)

- [ ] **Step 2: Widen the SELECT strings**

Replace both SELECT constants:

```ts
// Columns selected from Supabase for each table (avoid pulling heavy jsonb;
// `cover` is the only jsonb column and stays small).
export const PART_TEST_SELECT =
  'id, name, part, test_type, level, total_question, duration_in_second, document_status, content_access_type, cover, version, created_by, updated_by, updated_at'

export const FULL_TEST_SELECT =
  'id, name, test_type, parent_test_type, level, total_question, duration_in_second, document_status, content_access_type, cover, version, created_by, updated_by, updated_at'
```

- [ ] **Step 3: Add the sortable-columns whitelist**

At the end of the file:

```ts
// Server-side sortable columns, shared by both tabs. Anything else in the
// URL falls back to the default `updated_at desc`.
export const sortableEntryColumns = [
  'name',
  'total_question',
  'duration_in_second',
  'updated_at',
  'version',
] as const
```

- [ ] **Step 4: Verify typecheck**

Run: `pnpm build`
Expected: PASS (schemas compile; no consumer breaks yet — zod parses the new fields once hooks fetch them, which still match because SELECT and schema changed together).

- [ ] **Step 5: Commit**

```bash
git add src/features/entry/data/schema.ts
git commit -m "feat(entry): select cover, version, created_by, updated_by from Supabase"
```

---

### Task 3: Sorting support in `useTableUrlState`

**Files:**
- Modify: `src/hooks/use-table-url-state.ts`
- Test: `src/hooks/use-table-url-state.test.ts`

URL is the source of truth for sorting (no local state, unlike columnFilters). Keys default to `sortBy` / `sortDesc`. When the next sort equals the configured default (or is cleared), both keys are removed from the URL. Changing sort always resets the page key.

- [ ] **Step 1: Write the failing tests**

Append to the `describe('useTableUrlState', ...)` block in `src/hooks/use-table-url-state.test.ts`:

```ts
  it('returns undefined sorting when sorting is not configured', async () => {
    const navigate = vi.fn() as Mock<NavigateFn>
    const { result } = await renderHook(() =>
      useTableUrlState({ search: {}, navigate })
    )

    expect(result.current.sorting).toBeUndefined()
    expect(result.current.onSortingChange).toBeUndefined()
  })

  it('derives default sorting when search has no sort keys', async () => {
    const navigate = vi.fn() as Mock<NavigateFn>
    const { result } = await renderHook(() =>
      useTableUrlState({
        search: {},
        navigate,
        sorting: {
          defaultColumn: 'updated_at',
          defaultDesc: true,
          allowedColumns: ['name', 'updated_at'],
        },
      })
    )

    expect(result.current.sorting).toEqual([{ id: 'updated_at', desc: true }])
  })

  it('derives sorting from search params', async () => {
    const navigate = vi.fn() as Mock<NavigateFn>
    const { result } = await renderHook(() =>
      useTableUrlState({
        search: { sortBy: 'name', sortDesc: false },
        navigate,
        sorting: {
          defaultColumn: 'updated_at',
          defaultDesc: true,
          allowedColumns: ['name', 'updated_at'],
        },
      })
    )

    expect(result.current.sorting).toEqual([{ id: 'name', desc: false }])
  })

  it('falls back to default sorting when sortBy is not in allowedColumns', async () => {
    const navigate = vi.fn() as Mock<NavigateFn>
    const { result } = await renderHook(() =>
      useTableUrlState({
        search: { sortBy: 'evil_column', sortDesc: false },
        navigate,
        sorting: {
          defaultColumn: 'updated_at',
          defaultDesc: true,
          allowedColumns: ['name', 'updated_at'],
        },
      })
    )

    expect(result.current.sorting).toEqual([{ id: 'updated_at', desc: true }])
  })

  it('onSortingChange writes sort keys and clears page', async () => {
    const navigate = vi.fn() as Mock<NavigateFn>
    const prev = { page: 3, sortBy: undefined }
    const { result, act } = await renderHook(() =>
      useTableUrlState({
        search: prev,
        navigate,
        sorting: {
          defaultColumn: 'updated_at',
          defaultDesc: true,
          allowedColumns: ['name', 'updated_at'],
        },
      })
    )

    await act(() => {
      result.current.onSortingChange?.([{ id: 'name', desc: true }])
    })

    expect(applyLastSearchFn(navigate, prev)).toMatchObject({
      page: undefined,
      sortBy: 'name',
      sortDesc: true,
    })
  })

  it('onSortingChange removes sort keys when sorting matches the default or is cleared', async () => {
    const navigate = vi.fn() as Mock<NavigateFn>
    const prev = { sortBy: 'name', sortDesc: false }
    const { result, act } = await renderHook(() =>
      useTableUrlState({
        search: prev,
        navigate,
        sorting: {
          defaultColumn: 'updated_at',
          defaultDesc: true,
          allowedColumns: ['name', 'updated_at'],
        },
      })
    )

    await act(() => {
      result.current.onSortingChange?.([{ id: 'updated_at', desc: true }])
    })

    expect(applyLastSearchFn(navigate, prev)).toMatchObject({
      sortBy: undefined,
      sortDesc: undefined,
    })

    await act(() => {
      result.current.onSortingChange?.([])
    })

    expect(applyLastSearchFn(navigate, prev)).toMatchObject({
      sortBy: undefined,
      sortDesc: undefined,
    })
  })
```

- [ ] **Step 2: Run tests to verify the new ones fail**

Run: `pnpm test src/hooks/use-table-url-state.test.ts`
Expected: the 6 new tests FAIL (`sorting`/`onSortingChange` undefined or type error); the 16 existing tests still PASS.

- [ ] **Step 3: Implement sorting in the hook**

In `src/hooks/use-table-url-state.ts`:

3a. Extend the type imports (line 2-6):

```ts
import type {
  ColumnFiltersState,
  OnChangeFn,
  PaginationState,
  SortingState,
} from '@tanstack/react-table'
```

3b. Add to `UseTableUrlStateParams` (after the `columnFilters` member):

```ts
  sorting?: {
    sortByKey?: string
    sortDescKey?: string
    defaultColumn: string
    defaultDesc: boolean
    allowedColumns: readonly string[]
  }
```

3c. Add to `UseTableUrlStateReturn` (after the pagination members):

```ts
  // Sorting (only when configured)
  sorting?: SortingState
  onSortingChange?: OnChangeFn<SortingState>
```

3d. In the hook body, destructure `sorting: sortingCfg` alongside the other params, then add after the `onPaginationChange` definition:

```ts
  const sortByKey = sortingCfg?.sortByKey ?? ('sortBy' as string)
  const sortDescKey = sortingCfg?.sortDescKey ?? ('sortDesc' as string)

  // URL is the source of truth for sorting — no local state.
  const sorting: SortingState | undefined = useMemo(() => {
    if (!sortingCfg) return undefined
    const rawBy = (search as SearchRecord)[sortByKey]
    const rawDesc = (search as SearchRecord)[sortDescKey]
    if (
      typeof rawBy === 'string' &&
      sortingCfg.allowedColumns.includes(rawBy)
    ) {
      return [{ id: rawBy, desc: rawDesc === true }]
    }
    return [{ id: sortingCfg.defaultColumn, desc: sortingCfg.defaultDesc }]
  }, [sortingCfg, search, sortByKey, sortDescKey])

  const onSortingChange: OnChangeFn<SortingState> | undefined = sortingCfg
    ? (updater) => {
        const next =
          typeof updater === 'function' ? updater(sorting ?? []) : updater
        const first = next[0]
        const isDefault =
          !first ||
          (first.id === sortingCfg.defaultColumn &&
            first.desc === sortingCfg.defaultDesc)
        navigate({
          search: (prev) => ({
            ...(prev as SearchRecord),
            [pageKey]: undefined,
            [sortByKey]: isDefault ? undefined : first.id,
            [sortDescKey]: isDefault ? undefined : first.desc,
          }),
        })
      }
    : undefined
```

3e. Add `sorting` and `onSortingChange` to the returned object.

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test src/hooks/use-table-url-state.test.ts`
Expected: PASS (22 tests).

- [ ] **Step 5: Commit**

```bash
git add src/hooks/use-table-url-state.ts src/hooks/use-table-url-state.test.ts
git commit -m "feat(hooks): optional URL-backed sorting state in useTableUrlState"
```

---

### Task 4: Sorting param in the data hooks

**Files:**
- Modify: `src/features/entry/hooks/use-part-tests-data.ts`
- Modify: `src/features/entry/hooks/use-full-tests-data.ts`

`sorting` is **optional** with default `{ id: 'updated_at', desc: true }` so existing callers compile until Task 6 wires them. The hook re-validates the column against `sortableEntryColumns` (defense in depth — the URL layer already whitelists).

- [ ] **Step 1: Update `use-part-tests-data.ts`**

Add `sortableEntryColumns` to the schema import, add the type and param:

```ts
import {
  PART_TEST_SELECT,
  partTestRowsSchema,
  sortableEntryColumns,
  type PartTest,
} from '../data/schema'

export type EntrySorting = {
  id: string
  desc: boolean
}

const DEFAULT_SORTING: EntrySorting = { id: 'updated_at', desc: true }
```

Extend the params type:

```ts
type UsePartTestsDataParams = {
  pageIndex: number
  pageSize: number
  filters: PartTestsFilters
  sorting?: EntrySorting
}
```

In `fetchPartTests`, destructure `sorting = DEFAULT_SORTING` and replace the hardcoded `.order(...)` line:

```ts
  const sortColumn = (sortableEntryColumns as readonly string[]).includes(
    sorting.id
  )
    ? sorting.id
    : DEFAULT_SORTING.id

  let query = supabase
    .from('data_entry_part_test')
    .select(PART_TEST_SELECT, { count: 'exact' })
    .order(sortColumn, { ascending: !sorting.desc })
    .range(from, to)
```

(No queryKey change needed — `params` already includes `sorting` because the key is built from the whole params object.)

- [ ] **Step 2: Update `use-full-tests-data.ts` the same way**

Import `sortableEntryColumns` and the shared type:

```ts
import {
  FULL_TEST_SELECT,
  fullTestRowsSchema,
  sortableEntryColumns,
  type FullTest,
} from '../data/schema'
import { type EntrySorting } from './use-part-tests-data'

const DEFAULT_SORTING: EntrySorting = { id: 'updated_at', desc: true }
```

Add `sorting?: EntrySorting` to `UseFullTestsDataParams`, destructure `sorting = DEFAULT_SORTING` in `fetchFullTests`, and replace the `.order(...)` line:

```ts
  const sortColumn = (sortableEntryColumns as readonly string[]).includes(
    sorting.id
  )
    ? sorting.id
    : DEFAULT_SORTING.id

  let query = supabase
    .from('data_entry_full_test')
    .select(FULL_TEST_SELECT, { count: 'exact' })
    .order(sortColumn, { ascending: !sorting.desc })
    .range(from, to)
```

- [ ] **Step 3: Verify**

Run: `pnpm lint && pnpm build`
Expected: PASS (param is optional, existing callers unaffected).

- [ ] **Step 4: Commit**

```bash
git add src/features/entry/hooks/use-part-tests-data.ts src/features/entry/hooks/use-full-tests-data.ts
git commit -m "feat(entry): server-side sort param in part/full test data hooks"
```

---

### Task 5: `EntryCoverCell` thumbnail component

**Files:**
- Create: `src/features/entry/components/entry-cover-cell.tsx`
- Create: `src/features/entry/components/entry-cover-cell.test.tsx`

- [ ] **Step 1: Write the failing tests**

Create `src/features/entry/components/entry-cover-cell.test.tsx`:

```tsx
import { afterEach, describe, expect, it, vi } from 'vitest'
import { render } from 'vitest-browser-react'
import { EntryCoverCell } from './entry-cover-cell'

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('EntryCoverCell', () => {
  it('renders a placeholder when cover is null', async () => {
    const { container } = await render(<EntryCoverCell cover={null} />)
    expect(container.querySelector('img')).toBeNull()
    expect(container.querySelector('[data-slot="cover-placeholder"]')).not.toBeNull()
  })

  it('renders a placeholder when cover has no path', async () => {
    const { container } = await render(
      <EntryCoverCell cover={{ name: 'x.png', path: null }} />
    )
    expect(container.querySelector('img')).toBeNull()
  })

  it('renders an image when the path resolves against the CDN base', async () => {
    vi.stubEnv('VITE_MEDIA_BASE_URL', 'https://cdn.test/')
    const { container } = await render(
      <EntryCoverCell cover={{ name: 'cover.png', path: 'PUBLIC/MEDIA/cover.png' }} />
    )
    const img = container.querySelector('img')
    expect(img).not.toBeNull()
    expect(img!.getAttribute('src')).toBe('https://cdn.test/PUBLIC/MEDIA/cover.png')
    expect(img!.getAttribute('alt')).toBe('cover.png')
  })
})
```

> Note: `vi.stubEnv` patches `import.meta.env` at runtime; `mediaUrl`'s default parameter reads the env on each call, so the stub takes effect. If `stubEnv` proves unreliable in browser mode, fall back to passing `mediaUrl(cover?.path, import.meta.env.VITE_MEDIA_BASE_URL)` — do not weaken the assertion.

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test src/features/entry/components/entry-cover-cell.test.tsx`
Expected: FAIL — component does not exist.

- [ ] **Step 3: Implement the component**

Create `src/features/entry/components/entry-cover-cell.tsx`:

```tsx
import { useState } from 'react'
import { Image as ImageIcon } from 'lucide-react'
import { mediaUrl } from '../data/media'
import { type MediaObject } from '../data/schema'

type EntryCoverCellProps = {
  cover: MediaObject | null | undefined
}

/**
 * 40x40 cover thumbnail. Falls back to a muted placeholder when the cover
 * is missing or the image fails to load (broken CDN path) — the cell keeps
 * its size either way so the row height never shifts.
 */
export function EntryCoverCell({ cover }: EntryCoverCellProps) {
  const [failed, setFailed] = useState(false)
  const src = mediaUrl(cover?.path)

  if (!src || failed) {
    return (
      <div
        data-slot='cover-placeholder'
        className='flex size-10 items-center justify-center rounded-md bg-muted'
      >
        <ImageIcon
          className='size-4 text-muted-foreground'
          aria-hidden='true'
        />
      </div>
    )
  }

  return (
    <img
      src={src}
      alt={cover?.name ?? ''}
      loading='lazy'
      className='size-10 rounded-md object-cover'
      onError={() => setFailed(true)}
    />
  )
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test src/features/entry/components/entry-cover-cell.test.tsx`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/features/entry/components/entry-cover-cell.tsx src/features/entry/components/entry-cover-cell.test.tsx
git commit -m "feat(entry): cover thumbnail cell with placeholder fallback"
```

---

### Task 6: Column definitions — cover, new columns, enable sorting

**Files:**
- Modify: `src/features/entry/components/entry-columns-part-tests.tsx`
- Modify: `src/features/entry/components/entry-columns-full-tests.tsx`

Both files get identical treatment. Column order: **cover, name, …existing…, status, access, version, created_by, updated_by, updated_at**.

- [ ] **Step 1: Update `entry-columns-part-tests.tsx`**

1a. Add the import:

```tsx
import { EntryCoverCell } from './entry-cover-cell'
```

1b. Insert the cover column as the FIRST element of `entryColumnsPartTests`:

```tsx
  {
    id: 'cover',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title='Cover' />
    ),
    cell: ({ row }) => <EntryCoverCell cover={row.original.cover} />,
    enableSorting: false,
    enableHiding: false,
  },
```

1c. Flip `enableSorting: false` → `enableSorting: true` on exactly these accessorKeys: `name`, `total_question`, `duration_in_second`, `updated_at`. Leave `part`, `test_type`, `level`, `document_status`, `content_access_type` as `enableSorting: false`.

1d. Insert before the `updated_at` column:

```tsx
  {
    accessorKey: 'version',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title='Version' />
    ),
    cell: ({ row }) => (
      <div className='tabular-nums'>{row.getValue('version')}</div>
    ),
    enableSorting: true,
  },
  {
    accessorKey: 'created_by',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title='Created By' />
    ),
    cell: ({ row }) => (
      <div className='text-nowrap'>{row.getValue('created_by') || '–'}</div>
    ),
    enableSorting: false,
  },
  {
    accessorKey: 'updated_by',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title='Updated By' />
    ),
    cell: ({ row }) => (
      <div className='text-nowrap'>{row.getValue('updated_by') || '–'}</div>
    ),
    enableSorting: false,
  },
```

- [ ] **Step 2: Update `entry-columns-full-tests.tsx` identically**

Same import, same cover column first, same three new columns before `updated_at`. Flip `enableSorting: true` on `name`, `total_question`, `duration_in_second`, `updated_at`. Leave `test_type`, `parent_test_type`, `level`, `document_status`, `content_access_type` unsortable.

- [ ] **Step 3: Verify**

Run: `pnpm lint && pnpm build`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/features/entry/components/entry-columns-part-tests.tsx src/features/entry/components/entry-columns-full-tests.tsx
git commit -m "feat(entry): cover thumbnail, version and audit columns, sortable headers"
```

---

### Task 7: Route search schema + table wiring

**Files:**
- Modify: `src/routes/_authenticated/entry/index.tsx`
- Modify: `src/features/entry/components/part-tests-table.tsx`
- Modify: `src/features/entry/components/full-tests-table.tsx`

- [ ] **Step 1: Add sort keys to the route search schema**

In `src/routes/_authenticated/entry/index.tsx`, add to `entrySearchSchema` after `document_status`:

```ts
  // Server-side sorting; invalid values fall back to updated_at desc in the
  // table layer (allowedColumns whitelist).
  sortBy: z.string().optional().catch(undefined),
  sortDesc: z.boolean().optional().catch(undefined),
```

- [ ] **Step 2: Wire sorting in `part-tests-table.tsx`**

2a. Import the whitelist — extend the existing `../data/schema` import with `sortableEntryColumns`.

2b. Destructure the new hook outputs and pass the sorting config:

```ts
  const {
    columnFilters,
    onColumnFiltersChange,
    pagination,
    onPaginationChange,
    sorting,
    onSortingChange,
    ensurePageInRange,
  } = useTableUrlState({
    search,
    navigate,
    pagination: { defaultPage: 1, defaultPageSize: 20 },
    globalFilter: { enabled: false },
    sorting: {
      defaultColumn: 'updated_at',
      defaultDesc: true,
      allowedColumns: sortableEntryColumns,
    },
    columnFilters: [
      // ... keep the existing entries unchanged ...
    ],
  })
```

2c. Pass sorting to the data hook (after the `filters` memo):

```ts
  const { data, count, isLoading, error, refetch } = usePartTestsData({
    pageIndex: pagination.pageIndex,
    pageSize: pagination.pageSize,
    filters,
    sorting: sorting?.[0],
  })
```

2d. Wire the table instance:

```ts
  const table = useReactTable({
    data,
    columns,
    state: {
      pagination,
      columnFilters,
      columnVisibility,
      sorting: sorting ?? [],
    },
    manualPagination: true,
    manualFiltering: true,
    manualSorting: true,
    enableMultiSort: false,
    pageCount,
    onPaginationChange,
    onColumnFiltersChange,
    onSortingChange,
    onColumnVisibilityChange: setColumnVisibility,
    getCoreRowModel: getCoreRowModel(),
  })
```

(Keep the existing `// eslint-disable-next-line react-hooks/incompatible-library` comment above `useReactTable`.)

- [ ] **Step 3: Wire sorting in `full-tests-table.tsx` identically**

Same four edits: import `sortableEntryColumns`, add the `sorting` config + destructure, pass `sorting: sorting?.[0]` to `useFullTestsData`, add `manualSorting: true`, `enableMultiSort: false`, `state.sorting`, and `onSortingChange` to `useReactTable`.

- [ ] **Step 4: Verify**

Run: `pnpm lint && pnpm build && pnpm test`
Expected: all PASS.

- [ ] **Step 5: Manual smoke check (dev server)**

Run `pnpm dev`, open `/entry`:
- Cover thumbnails render (rows with a cover show the image from `https://media.dolenglish.vn/...`; rows without show the gray placeholder).
- Click the **Name** header → Asc: URL gains `?sortBy=name&sortDesc=false`, rows reorder, page resets to 1.
- Sort by **Updated** Desc → `sortBy`/`sortDesc` disappear from the URL (matches default).
- Paste a URL with `?sortBy=garbage` → table loads with default updated_at desc, no error.
- Switch to **Full Tests** tab → same behaviors.

- [ ] **Step 6: Commit**

```bash
git add src/routes/_authenticated/entry/index.tsx src/features/entry/components/part-tests-table.tsx src/features/entry/components/full-tests-table.tsx
git commit -m "feat(entry): URL-persisted server-side sorting on both listing tabs"
```

---

### Task 8: Final verification

- [ ] **Step 1: Full gate**

Run: `pnpm lint && pnpm build && pnpm test && pnpm format`
Expected: lint/build/tests PASS; if `pnpm format` changes files (import order), re-run `pnpm lint && pnpm build`, then:

```bash
git add -u ':!src/features/users/components/users-delete-dialog.test.tsx'
git commit -m "style: format entry listing changes"
```

(Skip the commit if format produced no changes. Never stage `users-delete-dialog.test.tsx`.)

- [ ] **Step 2: Knip check**

Run: `pnpm knip`
Expected: no new unused-export findings from this work (`mediaUrl`, `mediaObjectSchema`, `MediaObject`, `EntryCoverCell`, `sortableEntryColumns`, `EntrySorting` are all consumed). If `MediaObject` or `EntrySorting` is flagged, inline the type instead of exporting.
