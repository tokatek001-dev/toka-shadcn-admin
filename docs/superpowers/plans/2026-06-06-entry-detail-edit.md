# Entry Detail/Edit Pages Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Admin-editable detail pages for part tests and full tests at `/entry/part-tests/$id` and `/entry/full-tests/$id`, reached by clicking listing rows, with optimistic-concurrency saves and a disabled-upload media section.

**Architecture:** Two routes share a detail chrome (`EntryDetailLayout` + `UnsavedChangesGuard` + `EntryMediaSection`); each test kind has its own form component built on react-hook-form + zod. Saves go straight to Supabase with `eq('version', loadedVersion)` compare-and-swap; an `is_admin()` UPDATE policy migration gates writes server-side and a `useIsAdmin` hook gates the UI.

**Tech Stack:** React 19, TanStack Router/Query, react-hook-form + zod v4, Supabase JS, shadcn (Form/Input/Textarea/SelectDropdown/Card/Tooltip), sonner toasts, Vitest browser mode.

**Spec:** `docs/superpowers/specs/2026-06-06-entry-detail-edit-design.md`
**Worktree:** `/home/liuhao/Documents/personal-v2/toka-shadcn-admin/.claude/worktrees/entry-detail` (branch `feature/entry-detail-edit`). NEVER touch the main checkout at the repo root.
**Known pre-existing failure:** `src/context/search-provider.test.tsx` (7 tests) — never run/fix it; it must not gate completion.

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `supabase/migrations/` (via MCP) | Migration | `is_admin()` UPDATE policies on both tables |
| `src/features/entry/data/detail-schema.ts` | Create | zod detail schemas, form schemas, payload mappers |
| `src/features/entry/data/detail-schema.test.ts` | Create | Unit tests for schemas/mappers |
| `src/features/entry/data/upload.ts` | Create | `uploadMedia` seam + `UploadNotConfiguredError` |
| `src/features/entry/hooks/use-test-detail.ts` | Create | Detail fetch hook (both kinds) |
| `src/features/entry/hooks/use-update-test.ts` | Create | Update mutation + `ConflictError` |
| `src/features/entry/hooks/use-update-test.test.ts` | Create | Unit test for conflict mapping helper |
| `src/hooks/use-is-admin.ts` | Create | Current-user role hook |
| `src/features/entry/components/detail/entry-detail-layout.tsx` | Create | Chrome: header, audit panel, sticky footer, sidebar slot |
| `src/features/entry/components/detail/unsaved-changes-guard.tsx` | Create | `useBlocker` + ConfirmDialog |
| `src/features/entry/components/detail/entry-media-section.tsx` | Create | Media previews + disabled Replace |
| `src/features/entry/components/detail/entry-media-section.test.tsx` | Create | Render/disabled tests |
| `src/features/entry/components/detail/duration-ms-field.tsx` | Create | ms number input + live mm:ss hint |
| `src/features/entry/components/detail/part-test-detail.tsx` | Create | Part-test page (form + sidebar) |
| `src/features/entry/components/detail/part-test-detail.test.tsx` | Create | Form render/pristine tests |
| `src/features/entry/components/detail/full-test-detail.tsx` | Create | Full-test page (form) |
| `src/routes/_authenticated/entry/part-tests/$id.tsx` | Create | Thin route |
| `src/routes/_authenticated/entry/full-tests/$id.tsx` | Create | Thin route |
| `src/features/entry/components/part-tests-table.tsx` | Modify | Row click → detail |
| `src/features/entry/components/full-tests-table.tsx` | Modify | Row click → detail |

Existing pieces reused: `mediaUrl` (`../data/media`), `formatDuration`/`formatUpdatedAt` (`../data/format`), option lists (`../data/schema`), `ConfirmDialog` (`@/components/confirm-dialog`), `SelectDropdown` (`@/components/select-dropdown`), `useAuthStore` (`@/stores/auth-store`), sonner `toast`.

---

### Task 1: DB migration — admin UPDATE policies (controller-assisted)

This task needs the Supabase MCP tool (`mcp__supabase__apply_migration`). If you are a subagent without it, report BLOCKED so the controller applies it.

- [ ] **Step 1: Apply migration** named `entry_admin_update_policies`:

```sql
create policy "Admins can update part tests" on public.data_entry_part_test
  for update to authenticated
  using (is_admin()) with check (is_admin());

create policy "Admins can update full tests" on public.data_entry_full_test
  for update to authenticated
  using (is_admin()) with check (is_admin());
```

- [ ] **Step 2: Verify** with `mcp__supabase__execute_sql`:

```sql
select tablename, policyname, cmd from pg_policies
where tablename in ('data_entry_part_test','data_entry_full_test') and cmd = 'UPDATE';
```

Expected: 2 rows.

- [ ] **Step 3: Flyway reminder** — surface to the user at the end of the run: copy this SQL into the backend Flyway repo (project process: Flyway is the canonical migration store; see `db-migrations-flyway-canonical` memory).

No repo commit in this task (DB-side only).

---

### Task 2: Detail schemas, form schemas, payload mappers

**Files:**
- Create: `src/features/entry/data/detail-schema.ts`
- Test: `src/features/entry/data/detail-schema.test.ts`

The file owns three layers: (1) zod parsers for the DB row (`select('*')`), (2) zod form schemas (string inputs → typed output), (3) mappers row→form-defaults and form→update-payload.

- [ ] **Step 1: Write the failing tests**

Create `src/features/entry/data/detail-schema.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import {
  fullTestDetailSchema,
  nullableIntString,
  partTestDetailSchema,
  partTestFormSchema,
  toPartTestDefaults,
  toPartTestPayload,
} from './detail-schema'

const basePartRow = {
  id: 'c0a8666f-0000-0000-0000-000000000001',
  base_id: 'legacy-1',
  name: 'ETS Part 4 Test',
  part_number: 4,
  start_part_order: 71,
  end_part_order: 100,
  total_question: 30,
  duration_in_second: 907000,
  audio_time: 907000,
  test_type: 'LISTENING',
  part: 'PART_4',
  level: 'TOEIC_600',
  base_source: 'ETS',
  cover: { name: 'c.png', path: 'PUBLIC/MEDIA/c.png', extra: 1 },
  ex_image: null,
  audio: null,
  directions: 'Listen carefully.',
  ex_description: null,
  knowledge_codes: null,
  transcript_characters: null,
  question_groups: [
    { group_title: 'Group A', number_of_question: 3, questions: [{}, {}, {}] },
  ],
  reading_part: false,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-06-01T00:00:00Z',
  document_status: 'PUBLISHED',
  content_access_type: 'FREE',
  version: 3,
  created_by: 'system',
  updated_by: 'system',
  flag_type: 'PRACTICE',
}

describe('partTestDetailSchema', () => {
  it('parses a full row and keeps question group titles', () => {
    const row = partTestDetailSchema.parse(basePartRow)
    expect(row.version).toBe(3)
    expect(row.question_groups?.[0]?.group_title).toBe('Group A')
  })

  it('tolerates null jsonb columns', () => {
    const row = partTestDetailSchema.parse({
      ...basePartRow,
      cover: null,
      question_groups: null,
    })
    expect(row.cover).toBeNull()
    expect(row.question_groups).toBeNull()
  })
})

describe('fullTestDetailSchema', () => {
  it('parses all_test_ids as a string array', () => {
    const row = fullTestDetailSchema.parse({
      id: 'c0a8666f-0000-0000-0000-000000000002',
      base_id: null,
      name: 'Full Test 1',
      test_type: 'FT',
      level: 'TOEIC_600',
      base_source: null,
      cover: null,
      total_question: 200,
      duration_in_second: 7200000,
      document_status: 'DRAFT',
      content_ids: null,
      all_test_ids: ['a', 'b'],
      created_at: null,
      updated_at: null,
      parent_test_type: 'SKILL_TEST',
      content_access_type: 'FREE',
      version: 1,
      created_by: 'system',
      updated_by: 'system',
    })
    expect(row.all_test_ids).toEqual(['a', 'b'])
  })
})

describe('nullableIntString', () => {
  it('maps empty string to null and numeric strings to numbers', () => {
    expect(nullableIntString.parse('')).toBeNull()
    expect(nullableIntString.parse('  ')).toBeNull()
    expect(nullableIntString.parse('42')).toBe(42)
  })

  it('rejects negatives and non-integers', () => {
    expect(() => nullableIntString.parse('-1')).toThrow()
    expect(() => nullableIntString.parse('1.5')).toThrow()
    expect(() => nullableIntString.parse('abc')).toThrow()
  })
})

describe('part form schema + mappers', () => {
  it('round-trips row → defaults → payload', () => {
    const row = partTestDetailSchema.parse(basePartRow)
    const defaults = toPartTestDefaults(row)
    expect(defaults.name).toBe('ETS Part 4 Test')
    expect(defaults.duration_in_second).toBe('907000')
    const values = partTestFormSchema.parse(defaults)
    const payload = toPartTestPayload(values)
    expect(payload.duration_in_second).toBe(907000)
    expect(payload.name).toBe('ETS Part 4 Test')
    expect(payload).not.toHaveProperty('version')
    expect(payload).not.toHaveProperty('updated_by')
  })

  it('requires a non-empty name', () => {
    const row = partTestDetailSchema.parse(basePartRow)
    const defaults = { ...toPartTestDefaults(row), name: '  ' }
    expect(() => partTestFormSchema.parse(defaults)).toThrow()
  })
})
```

- [ ] **Step 2: Run** `pnpm test src/features/entry/data/detail-schema.test.ts` → FAIL (module missing).

- [ ] **Step 3: Implement** `src/features/entry/data/detail-schema.ts`:

```ts
import { z } from 'zod'
import { mediaObjectSchema } from './schema'

export type EntryKind = 'part' | 'full'

// ---------- DB row parsers (select('*')) ----------

// Sidebar preview only reads titles/counts; questions stay opaque.
const questionGroupPreviewSchema = z.looseObject({
  group_title: z.string().nullable().optional(),
  number_of_question: z.number().nullable().optional(),
  questions: z.array(z.unknown()).nullable().optional(),
})

export const partTestDetailSchema = z.looseObject({
  id: z.string(),
  base_id: z.string().nullable(),
  name: z.string().nullable(),
  part_number: z.number().nullable().optional(),
  start_part_order: z.number().nullable(),
  end_part_order: z.number().nullable(),
  total_question: z.number().nullable(),
  duration_in_second: z.number().nullable(),
  audio_time: z.number().nullable(),
  test_type: z.string().nullable(),
  part: z.string().nullable(),
  level: z.string().nullable(),
  base_source: z.string().nullable(),
  cover: mediaObjectSchema,
  ex_image: mediaObjectSchema,
  audio: mediaObjectSchema,
  directions: z.string().nullable(),
  ex_description: z.string().nullable(),
  question_groups: z.array(questionGroupPreviewSchema).nullable(),
  created_at: z.string().nullable(),
  updated_at: z.string().nullable(),
  document_status: z.string(),
  content_access_type: z.string(),
  version: z.number(),
  created_by: z.string(),
  updated_by: z.string(),
  flag_type: z.string(),
})
export type PartTestDetail = z.infer<typeof partTestDetailSchema>

export const fullTestDetailSchema = z.looseObject({
  id: z.string(),
  base_id: z.string().nullable(),
  name: z.string().nullable(),
  test_type: z.string().nullable(),
  level: z.string().nullable(),
  base_source: z.string().nullable(),
  cover: mediaObjectSchema,
  total_question: z.number().nullable(),
  duration_in_second: z.number().nullable(),
  document_status: z.string().nullable(),
  all_test_ids: z.array(z.string()).nullable(),
  created_at: z.string().nullable(),
  updated_at: z.string().nullable(),
  parent_test_type: z.string(),
  content_access_type: z.string().nullable(),
  version: z.number(),
  created_by: z.string(),
  updated_by: z.string(),
})
export type FullTestDetail = z.infer<typeof fullTestDetailSchema>

// ---------- form schemas (text inputs in, typed payload out) ----------

// Numeric text input: '' → null, otherwise a nonnegative integer.
export const nullableIntString = z
  .string()
  .trim()
  .refine((v) => v === '' || /^\d+$/.test(v), 'Must be a nonnegative integer')
  .transform((v) => (v === '' ? null : Number(v)))

const requiredName = z
  .string()
  .trim()
  .min(1, 'Name is required')

export const partTestFormSchema = z.object({
  name: requiredName,
  part: z.string().min(1, 'Part is required'),
  test_type: z.string().min(1, 'Test type is required'),
  level: z.string().min(1, 'Level is required'),
  flag_type: z.string().min(1, 'Flag type is required'),
  total_question: nullableIntString,
  start_part_order: nullableIntString,
  end_part_order: nullableIntString,
  duration_in_second: nullableIntString,
  audio_time: nullableIntString,
  directions: z.string(),
  ex_description: z.string(),
  document_status: z.string().min(1, 'Status is required'),
  content_access_type: z.string().trim().min(1, 'Access type is required'),
  base_source: z.string(),
  base_id: z.string(),
})
export type PartTestFormInput = z.input<typeof partTestFormSchema>
export type PartTestFormValues = z.output<typeof partTestFormSchema>

export const fullTestFormSchema = z.object({
  name: requiredName,
  test_type: z.string().min(1, 'Test type is required'),
  parent_test_type: z.string().min(1, 'Parent type is required'),
  level: z.string().min(1, 'Level is required'),
  total_question: nullableIntString,
  duration_in_second: nullableIntString,
  document_status: z.string().min(1, 'Status is required'),
  content_access_type: z.string().trim().min(1, 'Access type is required'),
  base_source: z.string(),
  base_id: z.string(),
})
export type FullTestFormInput = z.input<typeof fullTestFormSchema>
export type FullTestFormValues = z.output<typeof fullTestFormSchema>

// ---------- mappers ----------

const str = (v: string | null | undefined) => v ?? ''
const numStr = (v: number | null | undefined) => (v == null ? '' : String(v))

export function toPartTestDefaults(row: PartTestDetail): PartTestFormInput {
  return {
    name: str(row.name),
    part: str(row.part),
    test_type: str(row.test_type),
    level: str(row.level),
    flag_type: row.flag_type,
    total_question: numStr(row.total_question),
    start_part_order: numStr(row.start_part_order),
    end_part_order: numStr(row.end_part_order),
    duration_in_second: numStr(row.duration_in_second),
    audio_time: numStr(row.audio_time),
    directions: str(row.directions),
    ex_description: str(row.ex_description),
    document_status: row.document_status,
    content_access_type: row.content_access_type,
    base_source: str(row.base_source),
    base_id: str(row.base_id),
  }
}

export function toFullTestDefaults(row: FullTestDetail): FullTestFormInput {
  return {
    name: str(row.name),
    test_type: str(row.test_type),
    parent_test_type: row.parent_test_type,
    level: str(row.level),
    total_question: numStr(row.total_question),
    duration_in_second: numStr(row.duration_in_second),
    document_status: str(row.document_status),
    content_access_type: str(row.content_access_type),
    base_source: str(row.base_source),
    base_id: str(row.base_id),
  }
}

// Update payloads: business columns only. Audit columns (version, updated_*)
// are added by the mutation; empty optional text becomes null.
const orNull = (v: string) => (v.trim() === '' ? null : v)

export function toPartTestPayload(values: PartTestFormValues) {
  return {
    name: values.name,
    part: values.part,
    test_type: values.test_type,
    level: values.level,
    flag_type: values.flag_type,
    total_question: values.total_question,
    start_part_order: values.start_part_order,
    end_part_order: values.end_part_order,
    duration_in_second: values.duration_in_second,
    audio_time: values.audio_time,
    directions: orNull(values.directions),
    ex_description: orNull(values.ex_description),
    document_status: values.document_status,
    content_access_type: values.content_access_type,
    base_source: orNull(values.base_source),
    base_id: orNull(values.base_id),
  }
}

export function toFullTestPayload(values: FullTestFormValues) {
  return {
    name: values.name,
    test_type: values.test_type,
    parent_test_type: values.parent_test_type,
    level: values.level,
    total_question: values.total_question,
    duration_in_second: values.duration_in_second,
    document_status: values.document_status,
    content_access_type: values.content_access_type,
    base_source: orNull(values.base_source),
    base_id: orNull(values.base_id),
  }
}
```

- [ ] **Step 4: Run** the test file → all PASS. Then `pnpm lint && pnpm build` → PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/entry/data/detail-schema.ts src/features/entry/data/detail-schema.test.ts
git commit -m "feat(entry): detail row parsers, form schemas, payload mappers"
```

---

### Task 3: `useIsAdmin` + `useTestDetail` hooks

**Files:**
- Create: `src/hooks/use-is-admin.ts`
- Create: `src/features/entry/hooks/use-test-detail.ts`

No unit tests here (both are thin network wrappers; behavior is covered by the browser verification at the end — same approach the listing hooks took).

- [ ] **Step 1: Create `src/hooks/use-is-admin.ts`**

```ts
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/auth-store'

/**
 * UX-level role check (RLS is the real enforcement). `user_profiles.id` IS
 * the auth user id; users can always read their own profile.
 */
export function useIsAdmin() {
  const user = useAuthStore((s) => s.user)

  const query = useQuery({
    queryKey: ['current-user-role', user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('user_profiles')
        .select('role')
        .eq('id', user!.id)
        .single()
      if (error) throw new Error(error.message)
      return (data as { role: string | null }).role
    },
  })

  return {
    isAdmin: query.data === 'admin',
    isLoading: !user || query.isLoading,
  }
}
```

- [ ] **Step 2: Create `src/features/entry/hooks/use-test-detail.ts`**

```ts
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import {
  fullTestDetailSchema,
  partTestDetailSchema,
  type EntryKind,
  type FullTestDetail,
  type PartTestDetail,
} from '../data/detail-schema'

const TABLE: Record<EntryKind, string> = {
  part: 'data_entry_part_test',
  full: 'data_entry_full_test',
}

export const testDetailKeys = {
  detail: (kind: EntryKind, id: string) => ['entry', kind, 'detail', id] as const,
}

export class NotFoundError extends Error {}

async function fetchDetail(kind: EntryKind, id: string) {
  const { data, error } = await supabase
    .from(TABLE[kind])
    .select('*')
    .eq('id', id)
    .maybeSingle()
  if (error) throw new Error(error.message)
  if (!data) throw new NotFoundError('Test not found')
  return kind === 'part'
    ? partTestDetailSchema.parse(data)
    : fullTestDetailSchema.parse(data)
}

export function usePartTestDetail(id: string) {
  return useQuery<PartTestDetail>({
    queryKey: testDetailKeys.detail('part', id),
    queryFn: () => fetchDetail('part', id) as Promise<PartTestDetail>,
    retry: (count, error) => !(error instanceof NotFoundError) && count < 3,
  })
}

export function useFullTestDetail(id: string) {
  return useQuery<FullTestDetail>({
    queryKey: testDetailKeys.detail('full', id),
    queryFn: () => fetchDetail('full', id) as Promise<FullTestDetail>,
    retry: (count, error) => !(error instanceof NotFoundError) && count < 3,
  })
}
```

Note: the QueryClient in `src/main.tsx` defines a global retry policy — check it before adding the per-query `retry`; if the global policy already stops on thrown client errors, drop the `retry` option rather than fighting it. (Read `src/main.tsx` and decide; report what you chose.)

- [ ] **Step 3: Verify** `pnpm lint && pnpm build` → PASS (exports currently unused; knip runs at the end, ignore for now).

- [ ] **Step 4: Commit**

```bash
git add src/hooks/use-is-admin.ts src/features/entry/hooks/use-test-detail.ts
git commit -m "feat(entry): detail fetch hooks and useIsAdmin role check"
```

---

### Task 4: `useUpdateTest` mutation with conflict detection

**Files:**
- Create: `src/features/entry/hooks/use-update-test.ts`
- Test: `src/features/entry/hooks/use-update-test.test.ts`

- [ ] **Step 1: Write the failing test** (pure helper only — the mutation itself is a thin wrapper):

```ts
import { describe, expect, it } from 'vitest'
import { ConflictError, assertUpdateApplied } from './use-update-test'

describe('assertUpdateApplied', () => {
  it('passes when rows were updated', () => {
    expect(() => assertUpdateApplied([{ id: 'x' }])).not.toThrow()
  })

  it('throws ConflictError when no rows matched (version moved)', () => {
    expect(() => assertUpdateApplied([])).toThrow(ConflictError)
    expect(() => assertUpdateApplied(null)).toThrow(ConflictError)
  })
})
```

- [ ] **Step 2: Run** → FAIL. **Step 3: Implement** `src/features/entry/hooks/use-update-test.ts`:

```ts
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/auth-store'
import { type EntryKind } from '../data/detail-schema'
import { fullTestsKeys } from './use-full-tests-data'
import { partTestsKeys } from './use-part-tests-data'
import { testDetailKeys } from './use-test-detail'

const TABLE: Record<EntryKind, string> = {
  part: 'data_entry_part_test',
  full: 'data_entry_full_test',
}

/** Someone else saved between our load and our save. */
export class ConflictError extends Error {
  constructor() {
    super('This test was modified by someone else. Reload to get the latest version.')
  }
}

export function assertUpdateApplied(rows: unknown[] | null): void {
  if (!rows || rows.length === 0) throw new ConflictError()
}

type UpdateInput = {
  id: string
  /** version loaded with the form — compare-and-swap guard */
  version: number
  payload: Record<string, unknown>
}

export function useUpdateTest(kind: EntryKind) {
  const queryClient = useQueryClient()
  const email = useAuthStore((s) => s.user?.email)

  return useMutation({
    mutationFn: async ({ id, version, payload }: UpdateInput) => {
      const { data, error } = await supabase
        .from(TABLE[kind])
        .update({
          ...payload,
          version: version + 1,
          updated_by: email ?? 'unknown',
          updated_at: new Date().toISOString(),
        })
        .eq('id', id)
        .eq('version', version)
        .select('id')
      if (error) throw new Error(error.message)
      assertUpdateApplied(data)
    },
    onSuccess: (_data, { id }) => {
      void queryClient.invalidateQueries({ queryKey: testDetailKeys.detail(kind, id) })
      void queryClient.invalidateQueries({
        queryKey: kind === 'part' ? partTestsKeys.all : fullTestsKeys.all,
      })
    },
  })
}
```

- [ ] **Step 4: Run** test file → PASS; `pnpm lint && pnpm build` → PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/entry/hooks/use-update-test.ts src/features/entry/hooks/use-update-test.test.ts
git commit -m "feat(entry): optimistic-concurrency update mutation"
```

---

### Task 5: Upload seam + media section

**Files:**
- Create: `src/features/entry/data/upload.ts`
- Create: `src/features/entry/components/detail/entry-media-section.tsx`
- Test: `src/features/entry/components/detail/entry-media-section.test.tsx`

- [ ] **Step 1: Create `src/features/entry/data/upload.ts`**

```ts
import { type MediaObject } from './schema'

export class UploadNotConfiguredError extends Error {
  constructor() {
    super('Upload chưa được cấu hình')
  }
}

/**
 * Seam for media upload (2b-infra). The destination (Supabase Storage vs the
 * DOL CDN upload API) is undecided; until it lands this always throws and the
 * UI keeps its Replace buttons disabled.
 */
export function uploadMedia(_file: File): Promise<MediaObject> {
  return Promise.reject(new UploadNotConfiguredError())
}

export const isUploadConfigured = false
```

- [ ] **Step 2: Write the failing component tests** `entry-media-section.test.tsx`:

```tsx
import { afterEach, describe, expect, it, vi } from 'vitest'
import { render } from 'vitest-browser-react'
import { EntryMediaSection } from './entry-media-section'

afterEach(() => vi.unstubAllEnvs())

describe('EntryMediaSection', () => {
  it('renders an image preview when the item has a path', async () => {
    vi.stubEnv('VITE_MEDIA_BASE_URL', 'https://cdn.test/')
    const { container } = await render(
      <EntryMediaSection
        items={[{ label: 'Cover', media: { name: 'c.png', path: 'PUBLIC/c.png' }, kind: 'image' }]}
      />
    )
    expect(container.querySelector('img')?.getAttribute('src')).toBe(
      'https://cdn.test/PUBLIC/c.png'
    )
  })

  it('renders a no-file placeholder and a disabled Replace button', async () => {
    const { container, getByRole } = await render(
      <EntryMediaSection items={[{ label: 'Cover', media: null, kind: 'image' }]} />
    )
    expect(container.querySelector('img')).toBeNull()
    const btn = getByRole('button', { name: /replace/i })
    await expect.element(btn).toBeDisabled()
  })

  it('shows the file name for audio media', async () => {
    const { getByText } = await render(
      <EntryMediaSection
        items={[{ label: 'Audio', media: { name: 'a.mp3', path: 'PUBLIC/a.mp3' }, kind: 'file' }]}
      />
    )
    await expect.element(getByText('a.mp3')).toBeInTheDocument()
  })
})
```

- [ ] **Step 3: Run** → FAIL. **Step 4: Implement** `entry-media-section.tsx`:

```tsx
import { Image as ImageIcon, Paperclip } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { mediaUrl } from '../../data/media'
import { type MediaObject } from '../../data/schema'
import { isUploadConfigured } from '../../data/upload'

export type MediaItem = {
  label: string
  media: MediaObject | undefined
  kind: 'image' | 'file'
}

type EntryMediaSectionProps = {
  items: MediaItem[]
}

/**
 * Read-only media previews with a Replace button that stays disabled until
 * the upload seam (`data/upload.ts`) is configured (phase 2b-infra).
 */
export function EntryMediaSection({ items }: EntryMediaSectionProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Media</CardTitle>
      </CardHeader>
      <CardContent className='flex flex-col gap-4'>
        {items.map((item) => {
          const src = mediaUrl(item.media?.path)
          return (
            <div key={item.label} className='flex items-center gap-3'>
              {item.kind === 'image' && src ? (
                <img
                  src={src}
                  alt={item.media?.name ?? ''}
                  className='size-16 rounded-md border object-cover'
                />
              ) : (
                <div className='flex size-16 items-center justify-center rounded-md border bg-muted'>
                  {item.kind === 'image' ? (
                    <ImageIcon className='size-5 text-muted-foreground' aria-hidden='true' />
                  ) : (
                    <Paperclip className='size-5 text-muted-foreground' aria-hidden='true' />
                  )}
                </div>
              )}
              <div className='min-w-0 flex-1'>
                <div className='text-sm font-medium'>{item.label}</div>
                <div className='truncate text-sm text-muted-foreground'>
                  {item.media?.name || 'No file'}
                </div>
              </div>
              <Tooltip>
                <TooltipTrigger asChild>
                  {/* span wrapper: disabled buttons don't fire tooltip events */}
                  <span tabIndex={0}>
                    <Button variant='outline' size='sm' disabled={!isUploadConfigured}>
                      Replace
                    </Button>
                  </span>
                </TooltipTrigger>
                <TooltipContent>Upload chưa được cấu hình</TooltipContent>
              </Tooltip>
            </div>
          )
        })}
      </CardContent>
    </Card>
  )
}
```

If `Tooltip` requires a provider, check how the codebase mounts tooltips (search `TooltipProvider` in `src/`); wrap inside the component if needed.

- [ ] **Step 5: Run** tests → 3 PASS; `pnpm lint && pnpm build` → PASS. **Step 6: Commit**

```bash
git add src/features/entry/data/upload.ts src/features/entry/components/detail/entry-media-section.tsx src/features/entry/components/detail/entry-media-section.test.tsx
git commit -m "feat(entry): media section with disabled upload seam"
```

---

### Task 6: Detail chrome — layout, unsaved-changes guard, duration field

**Files:**
- Create: `src/features/entry/components/detail/entry-detail-layout.tsx`
- Create: `src/features/entry/components/detail/unsaved-changes-guard.tsx`
- Create: `src/features/entry/components/detail/duration-ms-field.tsx`

No dedicated tests (pure presentational composition + router glue; covered via form tests in Task 7 and browser verification). TDD applies where there is logic — these are wiring.

- [ ] **Step 1: Create `entry-detail-layout.tsx`**

```tsx
import { type ReactNode } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Header } from '@/components/layout/header'
import { Main } from '@/components/layout/main'
import { ProfileDropdown } from '@/components/profile-dropdown'
import { ThemeSwitch } from '@/components/theme-switch'
import { formatUpdatedAt } from '../../data/format'

type AuditInfo = {
  version: number
  createdBy: string
  createdAt: string | null
  updatedBy: string
  updatedAt: string | null
}

type EntryDetailLayoutProps = {
  title: string
  status: string | null
  audit: AuditInfo
  canEdit: boolean
  isSaving: boolean
  isDirty: boolean
  onBack: () => void
  onSave: () => void
  onSaveAndFinish: () => void
  sidebar?: ReactNode
  children: ReactNode
}

export function EntryDetailLayout({
  title,
  status,
  audit,
  canEdit,
  isSaving,
  isDirty,
  onBack,
  onSave,
  onSaveAndFinish,
  sidebar,
  children,
}: EntryDetailLayoutProps) {
  return (
    <>
      <Header fixed>
        <div className='me-auto' />
        <ThemeSwitch />
        <ProfileDropdown />
      </Header>

      <Main className='flex flex-1 flex-col gap-4 pb-24 sm:gap-6'>
        <div className='flex flex-wrap items-center gap-3'>
          <h2 className='text-2xl font-bold tracking-tight'>{title}</h2>
          {status && <Badge variant='outline'>{status}</Badge>}
        </div>

        <div className='text-sm text-muted-foreground'>
          Version {audit.version} · Created by {audit.createdBy} on{' '}
          {formatUpdatedAt(audit.createdAt)} · Updated by {audit.updatedBy} on{' '}
          {formatUpdatedAt(audit.updatedAt)}
        </div>

        <div className='flex flex-1 items-start gap-6'>
          {sidebar && (
            <aside className='sticky top-20 hidden w-64 shrink-0 lg:block'>
              {sidebar}
            </aside>
          )}
          <div className='min-w-0 flex-1'>{children}</div>
        </div>

        <div className='fixed inset-x-0 bottom-0 z-10 border-t bg-background/95 p-3 backdrop-blur'>
          <div className='mx-auto flex max-w-3xl justify-end gap-2'>
            <Button variant='outline' onClick={onBack} disabled={isSaving}>
              Back
            </Button>
            {canEdit && (
              <>
                <Button onClick={onSave} disabled={!isDirty || isSaving}>
                  Save
                </Button>
                <Button
                  onClick={onSaveAndFinish}
                  disabled={!isDirty || isSaving}
                >
                  Save & Finish
                </Button>
              </>
            )}
          </div>
        </div>
      </Main>
    </>
  )
}
```

- [ ] **Step 2: Create `unsaved-changes-guard.tsx`**

```tsx
import { useBlocker } from '@tanstack/react-router'
import { ConfirmDialog } from '@/components/confirm-dialog'

type UnsavedChangesGuardProps = {
  when: boolean
}

/** Blocks in-app navigation while `when` is true; confirm proceeds. */
export function UnsavedChangesGuard({ when }: UnsavedChangesGuardProps) {
  const { proceed, reset, status } = useBlocker({
    shouldBlockFn: () => when,
    withResolver: true,
    enableBeforeUnload: when,
  })

  return (
    <ConfirmDialog
      open={status === 'blocked'}
      onOpenChange={(open) => {
        if (!open) reset?.()
      }}
      title='Có thay đổi chưa lưu'
      desc='Rời trang sẽ mất các thay đổi chưa lưu. Tiếp tục?'
      confirmText='Rời trang'
      destructive
      handleConfirm={() => proceed?.()}
    />
  )
}
```

Check `@/components/confirm-dialog` prop names before using (`confirmText`, `destructive`, `handleConfirm` — adjust to the actual API; it was read earlier as `{ open, onOpenChange, title, desc, handleConfirm }`). Check the installed `useBlocker` signature in `node_modules/@tanstack/react-router/dist/esm/useBlocker.d.ts` — if the resolver API differs (e.g. `status === 'blocked'` vs booleans), adapt while keeping behavior: dialog opens on block, confirm proceeds, cancel stays.

- [ ] **Step 3: Create `duration-ms-field.tsx`**

```tsx
import { type Control, type FieldPath, type FieldValues } from 'react-hook-form'
import {
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { formatDuration } from '../../data/format'

type DurationMsFieldProps<T extends FieldValues> = {
  control: Control<T>
  name: FieldPath<T>
  label: string
  disabled?: boolean
}

/**
 * Millisecond input with a live mm:ss hint — `duration_in_second`/`audio_time`
 * store MILLISECONDS despite their names.
 */
export function DurationMsField<T extends FieldValues>({
  control,
  name,
  label,
  disabled,
}: DurationMsFieldProps<T>) {
  return (
    <FormField
      control={control}
      name={name}
      render={({ field }) => {
        const ms = /^\d+$/.test(String(field.value ?? '').trim())
          ? Number(String(field.value).trim())
          : null
        return (
          <FormItem>
            <FormLabel>{label}</FormLabel>
            <FormControl>
              <Input inputMode='numeric' disabled={disabled} {...field} />
            </FormControl>
            <FormDescription>
              Milliseconds{ms != null ? ` — ${formatDuration(ms)}` : ''}
            </FormDescription>
            <FormMessage />
          </FormItem>
        )
      }}
    />
  )
}
```

- [ ] **Step 4: Verify** `pnpm lint && pnpm build` → PASS. **Step 5: Commit**

```bash
git add src/features/entry/components/detail/entry-detail-layout.tsx src/features/entry/components/detail/unsaved-changes-guard.tsx src/features/entry/components/detail/duration-ms-field.tsx
git commit -m "feat(entry): detail chrome - layout, unsaved guard, duration field"
```

---

### Task 7: Part-test detail page + route

**Files:**
- Create: `src/features/entry/components/detail/part-test-detail.tsx`
- Create: `src/routes/_authenticated/entry/part-tests/$id.tsx`
- Test: `src/features/entry/components/detail/part-test-detail.test.tsx`

- [ ] **Step 1: Create the route** `src/routes/_authenticated/entry/part-tests/$id.tsx`:

```tsx
import { createFileRoute } from '@tanstack/react-router'
import { PartTestDetail } from '@/features/entry/components/detail/part-test-detail'

export const Route = createFileRoute('/_authenticated/entry/part-tests/$id')({
  component: PartTestDetailPage,
})

function PartTestDetailPage() {
  const { id } = Route.useParams()
  return <PartTestDetail id={id} />
}
```

- [ ] **Step 2: Implement `part-test-detail.tsx`**

```tsx
import { useEffect } from 'react'
import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import { useCanGoBack, useRouter } from '@tanstack/react-router'
import { AlertCircle } from 'lucide-react'
import { toast } from 'sonner'
import { useIsAdmin } from '@/hooks/use-is-admin'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'
import { SelectDropdown } from '@/components/select-dropdown'
import {
  partTestFormSchema,
  toPartTestDefaults,
  toPartTestPayload,
  type PartTestDetail as PartTestRow,
  type PartTestFormInput,
} from '../../data/detail-schema'
import {
  levelOptions,
  partDocumentStatusOptions,
  partOptions,
  partTestTypeOptions,
} from '../../data/schema'
import { ConflictError, useUpdateTest } from '../../hooks/use-update-test'
import { NotFoundError, usePartTestDetail } from '../../hooks/use-test-detail'
import { DurationMsField } from './duration-ms-field'
import { EntryDetailLayout } from './entry-detail-layout'
import { EntryMediaSection } from './entry-media-section'
import { UnsavedChangesGuard } from './unsaved-changes-guard'

const flagTypeOptions = [
  { label: 'Practice', value: 'PRACTICE' },
  { label: 'Mini', value: 'MINI' },
]

export function PartTestDetail({ id }: { id: string }) {
  const detail = usePartTestDetail(id)

  if (detail.isLoading) return <DetailSkeleton />
  if (detail.error instanceof NotFoundError) return <NotFound />
  if (detail.error || !detail.data) {
    return (
      <ErrorState
        message={detail.error?.message ?? 'Unknown error'}
        onRetry={() => void detail.refetch()}
      />
    )
  }
  return <PartTestForm row={detail.data} />
}

function PartTestForm({ row }: { row: PartTestRow }) {
  const router = useRouter()
  const canGoBack = useCanGoBack()
  const { isAdmin, isLoading: roleLoading } = useIsAdmin()
  const updateTest = useUpdateTest('part')
  const canEdit = isAdmin && !roleLoading

  const form = useForm<PartTestFormInput>({
    resolver: zodResolver(partTestFormSchema),
    defaultValues: toPartTestDefaults(row),
  })

  // Re-sync after a save bumps version (query invalidation refetches the row).
  useEffect(() => {
    form.reset(toPartTestDefaults(row))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [row])

  const goBack = () => {
    if (canGoBack) router.history.back()
    else void router.navigate({ to: '/entry' })
  }

  const save = (andFinish: boolean) =>
    form.handleSubmit(async (values) => {
      try {
        await updateTest.mutateAsync({
          id: row.id,
          version: row.version,
          payload: toPartTestPayload(partTestFormSchema.parse(values)),
        })
        toast.success('Saved')
        if (andFinish) goBack()
      } catch (e) {
        if (e instanceof ConflictError) {
          toast.error(e.message, {
            action: { label: 'Reload', onClick: () => window.location.reload() },
          })
        } else {
          toast.error(e instanceof Error ? e.message : 'Save failed')
        }
      }
    })()

  const disabled = !canEdit || updateTest.isPending

  return (
    <EntryDetailLayout
      title={row.name ?? 'Part test'}
      status={row.document_status}
      audit={{
        version: row.version,
        createdBy: row.created_by,
        createdAt: row.created_at,
        updatedBy: row.updated_by,
        updatedAt: row.updated_at,
      }}
      canEdit={canEdit}
      isSaving={updateTest.isPending}
      isDirty={form.formState.isDirty}
      onBack={goBack}
      onSave={() => void save(false)}
      onSaveAndFinish={() => void save(true)}
      sidebar={<GroupsSidebar row={row} />}
    >
      <UnsavedChangesGuard when={form.formState.isDirty && !updateTest.isPending} />
      <Form {...form}>
        <form className='flex max-w-3xl flex-col gap-6'>
          <Card>
            <CardHeader>
              <CardTitle>Basics</CardTitle>
            </CardHeader>
            <CardContent className='grid gap-4 sm:grid-cols-2'>
              <TextField control={form.control} name='name' label='Name' disabled={disabled} className='sm:col-span-2' />
              <SelectField control={form.control} name='part' label='Part' items={partOptions} disabled={disabled} />
              <SelectField control={form.control} name='test_type' label='Test type' items={partTestTypeOptions} disabled={disabled} />
              <SelectField control={form.control} name='level' label='Level' items={levelOptions} disabled={disabled} />
              <SelectField control={form.control} name='flag_type' label='Flag type' items={flagTypeOptions} disabled={disabled} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Numbers</CardTitle>
            </CardHeader>
            <CardContent className='grid gap-4 sm:grid-cols-2'>
              <TextField control={form.control} name='total_question' label='Total questions' disabled={disabled} />
              <TextField control={form.control} name='start_part_order' label='Start part order' disabled={disabled} />
              <TextField control={form.control} name='end_part_order' label='End part order' disabled={disabled} />
              <DurationMsField control={form.control} name='duration_in_second' label='Duration' disabled={disabled} />
              <DurationMsField control={form.control} name='audio_time' label='Audio time' disabled={disabled} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Descriptions</CardTitle>
            </CardHeader>
            <CardContent className='grid gap-4'>
              <TextareaField control={form.control} name='directions' label='Directions' disabled={disabled} />
              <TextareaField control={form.control} name='ex_description' label='Example description' disabled={disabled} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Status & source</CardTitle>
            </CardHeader>
            <CardContent className='grid gap-4 sm:grid-cols-2'>
              <SelectField control={form.control} name='document_status' label='Status' items={partDocumentStatusOptions} disabled={disabled} />
              <TextField control={form.control} name='content_access_type' label='Access type' disabled={disabled} />
              <TextField control={form.control} name='base_source' label='Base source' disabled={disabled} />
              <TextField control={form.control} name='base_id' label='Base id' disabled={disabled} />
            </CardContent>
          </Card>

          <EntryMediaSection
            items={[
              { label: 'Cover', media: row.cover, kind: 'image' },
              { label: 'Example image', media: row.ex_image, kind: 'image' },
              { label: 'Audio', media: row.audio, kind: 'file' },
            ]}
          />
        </form>
      </Form>
    </EntryDetailLayout>
  )
}

function GroupsSidebar({ row }: { row: PartTestRow }) {
  const groups = row.question_groups ?? []
  return (
    <Card>
      <CardHeader>
        <CardTitle className='text-base'>Question groups</CardTitle>
      </CardHeader>
      <CardContent className='flex flex-col gap-1 text-sm'>
        {groups.length === 0 && (
          <span className='text-muted-foreground'>No groups</span>
        )}
        {groups.map((g, i) => (
          <div key={i} className='truncate text-muted-foreground'>
            {g.group_title || `Group ${i + 1}`} —{' '}
            {g.number_of_question ?? g.questions?.length ?? 0} câu
          </div>
        ))}
        {groups.length > 0 && (
          <span className='mt-2 text-xs text-muted-foreground'>
            Chỉnh sửa nội dung câu hỏi ở phase sau
          </span>
        )}
      </CardContent>
    </Card>
  )
}

```

`TextField`, `TextareaField`, `SelectField`, `DetailSkeleton`, `NotFound`, `ErrorState` live in a shared file `src/features/entry/components/detail/detail-fields.tsx` (both forms import them) — `part-test-detail.tsx` imports them from `./detail-fields` and must not define its own copies. The shared file:

```tsx
// src/features/entry/components/detail/detail-fields.tsx
import { type Control, type FieldPath, type FieldValues } from 'react-hook-form'
import { Link } from '@tanstack/react-router'
import { AlertCircle } from 'lucide-react'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import {
  Form as _Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'
import { SelectDropdown } from '@/components/select-dropdown'

type FieldProps<T extends FieldValues> = {
  control: Control<T>
  name: FieldPath<T>
  label: string
  disabled?: boolean
  className?: string
}

export function TextField<T extends FieldValues>({ control, name, label, disabled, className }: FieldProps<T>) {
  return (
    <FormField
      control={control}
      name={name}
      render={({ field }) => (
        <FormItem className={className}>
          <FormLabel>{label}</FormLabel>
          <FormControl>
            <Input disabled={disabled} {...field} />
          </FormControl>
          <FormMessage />
        </FormItem>
      )}
    />
  )
}

export function TextareaField<T extends FieldValues>({ control, name, label, disabled, className }: FieldProps<T>) {
  return (
    <FormField
      control={control}
      name={name}
      render={({ field }) => (
        <FormItem className={className}>
          <FormLabel>{label}</FormLabel>
          <FormControl>
            <Textarea rows={4} disabled={disabled} {...field} />
          </FormControl>
          <FormMessage />
        </FormItem>
      )}
    />
  )
}

export function SelectField<T extends FieldValues>({
  control,
  name,
  label,
  disabled,
  className,
  items,
}: FieldProps<T> & { items: { label: string; value: string }[] }) {
  return (
    <FormField
      control={control}
      name={name}
      render={({ field }) => (
        <FormItem className={className}>
          <FormLabel>{label}</FormLabel>
          <SelectDropdown
            isControlled
            defaultValue={field.value}
            onValueChange={field.onChange}
            items={items}
            disabled={disabled}
          />
          <FormMessage />
        </FormItem>
      )}
    />
  )
}

export function DetailSkeleton() {
  return (
    <div className='flex flex-col gap-4 p-8'>
      <Skeleton className='h-8 w-1/3' />
      <Skeleton className='h-64 w-full max-w-3xl' />
      <Skeleton className='h-64 w-full max-w-3xl' />
    </div>
  )
}

export function NotFound() {
  return (
    <div className='flex flex-col items-center gap-3 p-16'>
      <h2 className='text-xl font-semibold'>Test not found</h2>
      <Button asChild variant='outline'>
        <Link to='/entry'>Back to Entry Browser</Link>
      </Button>
    </div>
  )
}

export function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className='p-8'>
      <Alert variant='destructive'>
        <AlertCircle />
        <AlertTitle>Failed to load test</AlertTitle>
        <AlertDescription>
          {message}
          <Button variant='outline' size='sm' className='mt-2' onClick={onRetry}>
            Retry
          </Button>
        </AlertDescription>
      </Alert>
    </div>
  )
}
```

Remove the unused `_Form` import if lint flags it; `part-test-detail.tsx` then imports `{ TextField, TextareaField, SelectField, DetailSkeleton, NotFound, ErrorState }` from `./detail-fields` and drops its own duplicates/stubs and unused ui imports.

- [ ] **Step 3: Write component tests** `part-test-detail.test.tsx`. The page needs router + query providers; mock the data hooks instead of the network:

```tsx
import { describe, expect, it, vi } from 'vitest'
import { render } from 'vitest-browser-react'

// Mock data/auth hooks; keep UI real.
vi.mock('../../hooks/use-test-detail', async (importOriginal) => {
  const mod = await importOriginal<typeof import('../../hooks/use-test-detail')>()
  return { ...mod, usePartTestDetail: vi.fn() }
})
vi.mock('@/hooks/use-is-admin', () => ({
  useIsAdmin: vi.fn(() => ({ isAdmin: true, isLoading: false })),
}))
vi.mock('../../hooks/use-update-test', async (importOriginal) => {
  const mod = await importOriginal<typeof import('../../hooks/use-update-test')>()
  return {
    ...mod,
    useUpdateTest: vi.fn(() => ({ isPending: false, mutateAsync: vi.fn() })),
  }
})
// Router hooks used by the form/guard need a real router OR shallow mocks:
vi.mock('@tanstack/react-router', async (importOriginal) => {
  const mod = await importOriginal<typeof import('@tanstack/react-router')>()
  return {
    ...mod,
    useRouter: () => ({ history: { back: vi.fn() }, navigate: vi.fn() }),
    useCanGoBack: () => false,
    useBlocker: () => ({ proceed: vi.fn(), reset: vi.fn(), status: 'idle' }),
    Link: ({ children }: { children?: unknown }) => <a>{children as never}</a>,
  }
})

import { usePartTestDetail } from '../../hooks/use-test-detail'
import { useIsAdmin } from '@/hooks/use-is-admin'
import { PartTestDetail } from './part-test-detail'

const row = {
  id: 'x',
  base_id: null,
  name: 'ETS Part 4',
  part_number: 4,
  start_part_order: 71,
  end_part_order: 100,
  total_question: 30,
  duration_in_second: 907000,
  audio_time: null,
  test_type: 'LISTENING',
  part: 'PART_4',
  level: 'TOEIC_600',
  base_source: null,
  cover: null,
  ex_image: null,
  audio: null,
  directions: null,
  ex_description: null,
  question_groups: [{ group_title: 'Group A', number_of_question: 3, questions: [] }],
  created_at: null,
  updated_at: null,
  document_status: 'PUBLISHED',
  content_access_type: 'FREE',
  version: 3,
  created_by: 'system',
  updated_by: 'system',
  flag_type: 'PRACTICE',
}

function mockDetail(data: unknown) {
  ;(usePartTestDetail as ReturnType<typeof vi.fn>).mockReturnValue({
    data,
    isLoading: false,
    error: null,
    refetch: vi.fn(),
  })
}

describe('PartTestDetail', () => {
  it('renders part-specific fields and the groups sidebar', async () => {
    mockDetail(row)
    const { getByText, getByLabelText } = await render(<PartTestDetail id='x' />)
    await expect.element(getByLabelText('Name')).toHaveValue('ETS Part 4')
    await expect.element(getByText('Group A — 3 câu')).toBeInTheDocument()
    await expect.element(getByLabelText('Directions')).toBeInTheDocument()
  })

  it('disables Save while the form is pristine', async () => {
    mockDetail(row)
    const { getByRole } = await render(<PartTestDetail id='x' />)
    await expect.element(getByRole('button', { name: 'Save', exact: true })).toBeDisabled()
  })

  it('hides Save buttons for non-admins and disables inputs', async () => {
    ;(useIsAdmin as ReturnType<typeof vi.fn>).mockReturnValue({ isAdmin: false, isLoading: false })
    mockDetail(row)
    const { getByLabelText, getByRole } = await render(<PartTestDetail id='x' />)
    await expect.element(getByLabelText('Name')).toBeDisabled()
    expect(getByRole('button', { name: 'Save', exact: true }).query()).toBeNull()
  })
})
```

Adjust mocking mechanics to what actually works in vitest browser mode (the repo's users dialog tests are the reference pattern — read `src/features/users/components/users-action-dialog.test.tsx` first and mirror its approach). Keep the three behavioral assertions: fields render, pristine Save disabled, non-admin view-only. If `Header`/`ProfileDropdown` pull in providers that explode in tests, mock `./entry-detail-layout`'s heavy imports the same way or mock `@/components/layout/header` etc. — but try unmocked first.

- [ ] **Step 4: Run** `pnpm test src/features/entry/components/detail/part-test-detail.test.tsx` → 3 PASS; `pnpm lint && pnpm build` → PASS (the build also regenerates `routeTree.gen.ts` — commit it if changed).

- [ ] **Step 5: Commit**

```bash
git add src/routes/_authenticated/entry/part-tests src/features/entry/components/detail/part-test-detail.tsx src/features/entry/components/detail/part-test-detail.test.tsx src/features/entry/components/detail/detail-fields.tsx src/routeTree.gen.ts
git commit -m "feat(entry): part-test detail page with admin edit form"
```

---

### Task 8: Full-test detail page + route

**Files:**
- Create: `src/features/entry/components/detail/full-test-detail.tsx`
- Create: `src/routes/_authenticated/entry/full-tests/$id.tsx`

- [ ] **Step 1: Create the route** `src/routes/_authenticated/entry/full-tests/$id.tsx`:

```tsx
import { createFileRoute } from '@tanstack/react-router'
import { FullTestDetail } from '@/features/entry/components/detail/full-test-detail'

export const Route = createFileRoute('/_authenticated/entry/full-tests/$id')({
  component: FullTestDetailPage,
})

function FullTestDetailPage() {
  const { id } = Route.useParams()
  return <FullTestDetail id={id} />
}
```

- [ ] **Step 2: Implement `full-test-detail.tsx`** — same structure as the part page, full-test fields only:

```tsx
import { useEffect } from 'react'
import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import { useCanGoBack, useRouter } from '@tanstack/react-router'
import { toast } from 'sonner'
import { useIsAdmin } from '@/hooks/use-is-admin'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Form } from '@/components/ui/form'
import {
  fullTestFormSchema,
  toFullTestDefaults,
  toFullTestPayload,
  type FullTestDetail as FullTestRow,
  type FullTestFormInput,
} from '../../data/detail-schema'
import {
  fullDocumentStatusOptions,
  fullTestTypeOptions,
  levelOptions,
  parentTestTypeOptions,
} from '../../data/schema'
import { ConflictError, useUpdateTest } from '../../hooks/use-update-test'
import { NotFoundError, useFullTestDetail } from '../../hooks/use-test-detail'
import {
  DetailSkeleton,
  ErrorState,
  NotFound,
  SelectField,
  TextField,
} from './detail-fields'
import { DurationMsField } from './duration-ms-field'
import { EntryDetailLayout } from './entry-detail-layout'
import { EntryMediaSection } from './entry-media-section'
import { UnsavedChangesGuard } from './unsaved-changes-guard'

export function FullTestDetail({ id }: { id: string }) {
  const detail = useFullTestDetail(id)

  if (detail.isLoading) return <DetailSkeleton />
  if (detail.error instanceof NotFoundError) return <NotFound />
  if (detail.error || !detail.data) {
    return (
      <ErrorState
        message={detail.error?.message ?? 'Unknown error'}
        onRetry={() => void detail.refetch()}
      />
    )
  }
  return <FullTestForm row={detail.data} />
}

function FullTestForm({ row }: { row: FullTestRow }) {
  const router = useRouter()
  const canGoBack = useCanGoBack()
  const { isAdmin, isLoading: roleLoading } = useIsAdmin()
  const updateTest = useUpdateTest('full')
  const canEdit = isAdmin && !roleLoading

  const form = useForm<FullTestFormInput>({
    resolver: zodResolver(fullTestFormSchema),
    defaultValues: toFullTestDefaults(row),
  })

  useEffect(() => {
    form.reset(toFullTestDefaults(row))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [row])

  const goBack = () => {
    if (canGoBack) router.history.back()
    else void router.navigate({ to: '/entry' })
  }

  const save = (andFinish: boolean) =>
    form.handleSubmit(async (values) => {
      try {
        await updateTest.mutateAsync({
          id: row.id,
          version: row.version,
          payload: toFullTestPayload(fullTestFormSchema.parse(values)),
        })
        toast.success('Saved')
        if (andFinish) goBack()
      } catch (e) {
        if (e instanceof ConflictError) {
          toast.error(e.message, {
            action: { label: 'Reload', onClick: () => window.location.reload() },
          })
        } else {
          toast.error(e instanceof Error ? e.message : 'Save failed')
        }
      }
    })()

  const disabled = !canEdit || updateTest.isPending
  const childCount = row.all_test_ids?.length ?? 0

  return (
    <EntryDetailLayout
      title={row.name ?? 'Full test'}
      status={row.document_status}
      audit={{
        version: row.version,
        createdBy: row.created_by,
        createdAt: row.created_at,
        updatedBy: row.updated_by,
        updatedAt: row.updated_at,
      }}
      canEdit={canEdit}
      isSaving={updateTest.isPending}
      isDirty={form.formState.isDirty}
      onBack={goBack}
      onSave={() => void save(false)}
      onSaveAndFinish={() => void save(true)}
    >
      <UnsavedChangesGuard when={form.formState.isDirty && !updateTest.isPending} />
      <Form {...form}>
        <form className='flex max-w-3xl flex-col gap-6'>
          <Card>
            <CardHeader>
              <CardTitle>Basics</CardTitle>
            </CardHeader>
            <CardContent className='grid gap-4 sm:grid-cols-2'>
              <TextField control={form.control} name='name' label='Name' disabled={disabled} className='sm:col-span-2' />
              <SelectField control={form.control} name='test_type' label='Test type' items={fullTestTypeOptions} disabled={disabled} />
              <SelectField control={form.control} name='parent_test_type' label='Parent type' items={parentTestTypeOptions} disabled={disabled} />
              <SelectField control={form.control} name='level' label='Level' items={levelOptions} disabled={disabled} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Numbers</CardTitle>
            </CardHeader>
            <CardContent className='grid gap-4 sm:grid-cols-2'>
              <TextField control={form.control} name='total_question' label='Total questions' disabled={disabled} />
              <DurationMsField control={form.control} name='duration_in_second' label='Duration' disabled={disabled} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Status & source</CardTitle>
            </CardHeader>
            <CardContent className='grid gap-4 sm:grid-cols-2'>
              <SelectField control={form.control} name='document_status' label='Status' items={fullDocumentStatusOptions} disabled={disabled} />
              <TextField control={form.control} name='content_access_type' label='Access type' disabled={disabled} />
              <TextField control={form.control} name='base_source' label='Base source' disabled={disabled} />
              <TextField control={form.control} name='base_id' label='Base id' disabled={disabled} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Child tests</CardTitle>
            </CardHeader>
            <CardContent className='text-sm text-muted-foreground'>
              {childCount} bài test con — chỉnh sửa ở phase sau
            </CardContent>
          </Card>

          <EntryMediaSection items={[{ label: 'Cover', media: row.cover, kind: 'image' }]} />
        </form>
      </Form>
    </EntryDetailLayout>
  )
}
```

- [ ] **Step 3: Verify** `pnpm lint && pnpm build` → PASS; commit `routeTree.gen.ts` if regenerated.

- [ ] **Step 4: Commit**

```bash
git add src/routes/_authenticated/entry/full-tests src/features/entry/components/detail/full-test-detail.tsx src/routeTree.gen.ts
git commit -m "feat(entry): full-test detail page with admin edit form"
```

---

### Task 9: Clickable listing rows

**Files:**
- Modify: `src/features/entry/components/part-tests-table.tsx`
- Modify: `src/features/entry/components/full-tests-table.tsx`

- [ ] **Step 1: Part-tests table** — add `useNavigate` (`import { useNavigate } from '@tanstack/react-router'` — but note the table already receives a `navigate` prop typed as `NavigateFn` for SEARCH updates; do NOT reuse that one for route changes). Inside `PartTestsTable`, add:

```tsx
import { useNavigate } from '@tanstack/react-router'
// ...
const routeNavigate = useNavigate()
```

and change the data row `<TableRow>` (the one inside `table.getRowModel().rows.map`) to:

```tsx
<TableRow
  key={row.id}
  className='group/row cursor-pointer'
  onClick={() =>
    void routeNavigate({
      to: '/entry/part-tests/$id',
      params: { id: row.original.id },
    })
  }
>
```

- [ ] **Step 2: Full-tests table** — same, navigating to `/entry/full-tests/$id`.

- [ ] **Step 3: Verify** `pnpm lint && pnpm build` → PASS, plus run the entry feature tests: `pnpm test src/features/entry` → all PASS.

- [ ] **Step 4: Commit**

```bash
git add src/features/entry/components/part-tests-table.tsx src/features/entry/components/full-tests-table.tsx
git commit -m "feat(entry): navigate to detail pages on row click"
```

---

### Task 10: Final gates

- [ ] **Step 1:** `pnpm lint && pnpm build` → PASS.
- [ ] **Step 2:** `pnpm test src/features/entry src/hooks` → all PASS (do not run the full suite's `search-provider` known failure).
- [ ] **Step 3:** `pnpm format`; if files changed, re-run lint+build and commit `style: format entry detail changes`.
- [ ] **Step 4:** `pnpm knip` → no NEW findings from this work. Acceptable pre-existing findings: `*Values` exports in `schema.ts`, `partTestsKeys`/`fullTestsKeys`. If a new export is flagged (e.g. `uploadMedia`, `isUploadConfigured`, `UploadNotConfiguredError`, a detail type), keep `uploadMedia`+`isUploadConfigured` (deliberate seam — add to knip ignore or mark with a comment per knip config conventions; check `knip.config.ts`) and inline/remove anything else unused.
- [ ] **Step 5:** Browser verification happens after this task (controller runs the verify flow: login admin → open detail from row click → edit name → Save → version bumps → Finish returns to listing; non-admin user → read-only).

---

## Self-review notes (already applied)

- Spec coverage: routes/navigation (T7/T8/T9), data layer (T2/T3/T4), migration (T1), UI chrome+forms+media (T5/T6/T7/T8), permissions (T1/T3, non-admin states in T7 tests), validation (T2), dirty guard (T6, used in T7/T8), upload seam (T5), groups sidebar (T7), Save/Save&Finish/Back (T6 layout + T7/T8 handlers), conflict toast (T4 + handlers).
- Type consistency: `EntryKind`, `PartTestFormInput/Values`, mappers, `ConflictError`, `NotFoundError`, `testDetailKeys` names match across tasks.
- Deliberate deviations allowed at implementation time: ConfirmDialog/useBlocker exact prop names (verify against actual APIs), test mocking mechanics (mirror users tests).
