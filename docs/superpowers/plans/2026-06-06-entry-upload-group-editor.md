# Entry Upload + Question-Group Editor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Working R2 uploads behind the detail pages' Replace buttons, and an editable question-group panel (add/remove groups/questions, options with single-correct) on the part-test page — all persisted through the existing CAS-versioned Save.

**Architecture:** `uploadMedia` posts to the R2 API with a Supabase Bearer token; `mediaUrl` resolves dual CDNs by path shape. Media objects and `question_groups` become RHF form fields on the existing detail forms, so dirty tracking, the unsaved guard, and the version compare-and-swap all apply unchanged. A pure `normalizeQuestionGroups` recomputes orders/counts at payload-build time.

**Tech Stack:** React 19, react-hook-form (`useFieldArray`), zod v4 (`z.looseObject`), Supabase JS, fetch + FormData, shadcn, Vitest browser mode.

**Spec:** `docs/superpowers/specs/2026-06-06-entry-upload-group-editor-design.md`
**Worktree:** `/home/liuhao/Documents/personal-v2/toka-shadcn-admin/.claude/worktrees/entry-upload-editor` (branch `feature/entry-upload-group-editor`). NEVER touch the main checkout.
**Known pre-existing failure:** `src/context/search-provider.test.tsx` — never run/fix/gate on it.

**One documented deviation from the spec:** the spec said to keep non-selected group panels mounted with CSS `hidden`. We render ONLY the selected group's panel (RHF keeps unmounted field values by default, and mounting every group's full editor would bloat the DOM); the "Thông tin chung" sections do stay mounted and CSS-hidden. Validation still covers hidden groups because zodResolver validates the whole form state; on save error we jump the selection to the first offending group.

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `.env.example`, `.env.local` | Modify | `VITE_UPLOAD_API_URL`, `VITE_MEDIA_R2_BASE_URL` |
| `src/features/entry/data/upload.ts` | Rewrite | real `uploadMedia`, `mergeMediaObject`, `isUploadConfigured()` |
| `src/features/entry/data/upload.test.ts` | Create | merge-shape + upload fetch tests |
| `src/features/entry/data/media.ts` | Modify | dual-CDN `mediaUrl` |
| `src/features/entry/data/media.test.ts` | Modify | new resolution-rule tests |
| `src/features/entry/data/question-groups.ts` | Create | `normalizeQuestionGroups`, `plateToText`, `newQuestion`, `newGroup`, `OPTION_IDS` |
| `src/features/entry/data/question-groups.test.ts` | Create | heavy unit tests |
| `src/features/entry/data/detail-schema.ts` | Modify | editable group/question/option zod, media + groups form fields, defaults/payload mappers |
| `src/features/entry/data/detail-schema.test.ts` | Modify | new mapper/validation tests |
| `src/features/entry/components/detail/entry-media-section.tsx` | Rewrite | live Replace buttons (file input, spinner, onReplaced) |
| `src/features/entry/components/detail/entry-media-section.test.tsx` | Modify | upload-flow tests |
| `src/features/entry/components/detail/question-group-editor.tsx` | Create | GroupPanel + QuestionCard + OptionsEditor + GroupsNav |
| `src/features/entry/components/detail/question-group-editor.test.tsx` | Create | component tests |
| `src/features/entry/components/detail/part-test-detail.tsx` | Modify | media fields, section switching, save normalization |
| `src/features/entry/components/detail/full-test-detail.tsx` | Modify | cover field wiring |
| `knip.config.ts` | Modify | drop the upload.ts ignore (exports now used) |

---

### Task 1: Env + real upload service

**Files:**
- Modify: `.env.example`, `.env.local` (local only)
- Rewrite: `src/features/entry/data/upload.ts`
- Create: `src/features/entry/data/upload.test.ts`

- [ ] **Step 1: Env vars**

Append to `.env.example`:

```bash
# R2 upload API (FastAPI; Supabase JWT Bearer when AUTH_ENABLED)
VITE_UPLOAD_API_URL=
# CDN serving newly uploaded R2 files (legacy PUBLIC/ paths use VITE_MEDIA_BASE_URL)
VITE_MEDIA_R2_BASE_URL=
```

Append real values to `.env.local` (NOT committed):

```bash
grep -q VITE_UPLOAD_API_URL .env.local || cat >> .env.local <<'EOF'
VITE_UPLOAD_API_URL=https://r2-upload.onrender.com
VITE_MEDIA_R2_BASE_URL=https://pub-726d405e1fd748059ee472ed7e49d800.r2.dev
EOF
```

- [ ] **Step 2: Write the failing tests** — `src/features/entry/data/upload.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: vi.fn(async () => ({
        data: { session: { access_token: 'jwt-123' } },
      })),
    },
  },
}))

import { MAX_UPLOAD_BYTES, mergeMediaObject, uploadMedia } from './upload'

afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

describe('mergeMediaObject', () => {
  const file = new File(['x'], 'new.png', { type: 'image/png' })
  const uploaded = { path: 'entry/uuid-new.png', size: 1, contentType: 'image/png' }

  it('preserves camelCase extra keys on part-level media', () => {
    const existing = {
      name: 'old.png', path: 'PUBLIC/MEDIA/old.png', size: 9,
      alt: '', caption: '', fileType: null, originLink: null, uploadedDate: 123,
    }
    const merged = mergeMediaObject(existing, file, uploaded)
    expect(merged).toMatchObject({
      name: 'new.png', path: 'entry/uuid-new.png', size: 1,
      fileType: null, originLink: null, uploadedDate: 123,
    })
  })

  it('preserves snake_case extra keys on group media', () => {
    const existing = {
      name: 'old.png', path: 'PUBLIC/MEDIA/old.png', size: 9,
      alt: null, caption: null, file_type: 'PUBLIC', origin_link: null, uploaded_date: 1,
    }
    const merged = mergeMediaObject(existing, file, uploaded) as Record<string, unknown>
    expect(merged.file_type).toBe('PUBLIC')
    expect(merged.path).toBe('entry/uuid-new.png')
    expect(merged).not.toHaveProperty('fileType')
  })

  it('builds a minimal object when existing is null', () => {
    expect(mergeMediaObject(null, file, uploaded)).toEqual({
      alt: null, caption: null, name: 'new.png', path: 'entry/uuid-new.png', size: 1,
    })
  })
})

describe('uploadMedia', () => {
  it('posts multipart with Bearer token and returns the parsed result', async () => {
    vi.stubEnv('VITE_UPLOAD_API_URL', 'https://upload.test')
    const fetchMock = vi.fn(async () =>
      new Response(
        JSON.stringify({
          status: 'success',
          data: { path: 'entry/u-1.png', size: 5, content_type: 'image/png', etag: 'e' },
        }),
        { status: 200 }
      )
    )
    vi.stubGlobal('fetch', fetchMock)

    const out = await uploadMedia(new File(['abcde'], 'a.png', { type: 'image/png' }))

    expect(out).toEqual({ path: 'entry/u-1.png', size: 5, contentType: 'image/png' })
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('https://upload.test/api/files?prefix=entry')
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer jwt-123')
    expect(init.body).toBeInstanceOf(FormData)
  })

  it('throws a descriptive error on HTTP failure', async () => {
    vi.stubEnv('VITE_UPLOAD_API_URL', 'https://upload.test')
    vi.stubGlobal('fetch', vi.fn(async () =>
      new Response(JSON.stringify({ detail: 'boom' }), { status: 500 })
    ))
    await expect(uploadMedia(new File(['x'], 'a.png'))).rejects.toThrow(/boom|500/)
  })

  it('rejects oversized files before any network call', async () => {
    vi.stubEnv('VITE_UPLOAD_API_URL', 'https://upload.test')
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const big = { size: MAX_UPLOAD_BYTES + 1, name: 'big.bin' } as unknown as File
    await expect(uploadMedia(big)).rejects.toThrow(/100/)
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 3: Run** `pnpm test src/features/entry/data/upload.test.ts` → FAIL (exports missing).

- [ ] **Step 4: Rewrite** `src/features/entry/data/upload.ts`:

```ts
import { supabase } from '@/lib/supabase'
import { type MediaObject } from './schema'

const env = import.meta.env as Record<string, string | undefined>

/** Backend caps uploads at 100 MB (r2_max_upload_size). */
export const MAX_UPLOAD_BYTES = 104_857_600

export type UploadedFile = {
  path: string
  size: number
  contentType: string
}

export function isUploadConfigured(): boolean {
  return !!env.VITE_UPLOAD_API_URL
}

/**
 * Upload a file to the R2 upload API (`POST /api/files?prefix=entry`).
 * Always sends the Supabase access token — the deployed instance currently
 * runs AUTH_ENABLED=false, but enabling auth must be a client no-op.
 */
export async function uploadMedia(file: File): Promise<UploadedFile> {
  const base = env.VITE_UPLOAD_API_URL
  if (!base) throw new Error('VITE_UPLOAD_API_URL is not configured')
  if (file.size > MAX_UPLOAD_BYTES) {
    throw new Error('File quá lớn (giới hạn 100 MB)')
  }

  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  const headers: Record<string, string> = {}
  if (token) headers.Authorization = `Bearer ${token}`

  const body = new FormData()
  body.append('file', file)

  const res = await fetch(
    `${base.replace(/\/+$/, '')}/api/files?prefix=entry`,
    { method: 'POST', headers, body }
  )
  if (!res.ok) {
    let message = `Upload failed (${res.status})`
    try {
      const err = (await res.json()) as { detail?: unknown }
      if (typeof err.detail === 'string') message = err.detail
    } catch {
      // keep the status-based message
    }
    throw new Error(message)
  }

  const json = (await res.json()) as {
    status?: string
    data?: { path?: string; size?: number; content_type?: string }
  }
  if (json.status !== 'success' || !json.data?.path) {
    throw new Error('Unexpected upload response')
  }
  return {
    path: json.data.path,
    size: json.data.size ?? file.size,
    contentType: json.data.content_type ?? file.type,
  }
}

/**
 * Merge an upload result into an existing media jsonb object, preserving its
 * key shape (part-level media uses camelCase extras like `fileType`; media
 * inside question_groups uses snake_case like `file_type`). Only
 * name/path/size are overwritten.
 */
export function mergeMediaObject(
  existing: MediaObject | null | undefined,
  file: File,
  uploaded: UploadedFile
): NonNullable<MediaObject> {
  return {
    alt: null,
    caption: null,
    ...(existing ?? {}),
    name: file.name,
    path: uploaded.path,
    size: uploaded.size,
  }
}
```

(`UploadNotConfiguredError` is deleted — nothing imports it.)

- [ ] **Step 5: Run** the test file → 6 PASS; `pnpm lint && pnpm build` → expect a build error in `entry-media-section.tsx` (`isUploadConfigured` is now a function). Patch that one line: `disabled={!isUploadConfigured()}` (Task 5 rewrites the component fully). Re-run → PASS. Also run `pnpm test src/features/entry/components/detail/entry-media-section.test.tsx` → 3 PASS (behavior unchanged: env unset in tests → still disabled).

- [ ] **Step 6: Commit**

```bash
git add .env.example src/features/entry/data/upload.ts src/features/entry/data/upload.test.ts src/features/entry/components/detail/entry-media-section.tsx
git commit -m "feat(entry): real R2 uploadMedia with Supabase bearer and shape-preserving merge"
```

---

### Task 2: Dual-CDN `mediaUrl`

**Files:**
- Modify: `src/features/entry/data/media.ts`
- Modify: `src/features/entry/data/media.test.ts`

- [ ] **Step 1: Add failing tests** — append to `media.test.ts` (keep existing `joinMediaUrl` describe; the existing `mediaUrl` test keeps passing because PUBLIC/-prefixed paths still use `VITE_MEDIA_BASE_URL` — UPDATE its fixture path to start with `PUBLIC/` if it doesn't already):

```ts
describe('mediaUrl dual-CDN resolution', () => {
  it('routes PUBLIC/ paths to the legacy CDN base', () => {
    vi.stubEnv('VITE_MEDIA_BASE_URL', 'https://legacy.test/')
    vi.stubEnv('VITE_MEDIA_R2_BASE_URL', 'https://r2.test/')
    expect(mediaUrl('PUBLIC/MEDIA/a.png')).toBe('https://legacy.test/PUBLIC/MEDIA/a.png')
  })

  it('routes bare paths to the R2 CDN base', () => {
    vi.stubEnv('VITE_MEDIA_BASE_URL', 'https://legacy.test/')
    vi.stubEnv('VITE_MEDIA_R2_BASE_URL', 'https://r2.test/')
    expect(mediaUrl('entry/uuid-a.png')).toBe('https://r2.test/entry/uuid-a.png')
  })

  it('passes through absolute URLs unchanged', () => {
    vi.stubEnv('VITE_MEDIA_R2_BASE_URL', 'https://r2.test/')
    expect(mediaUrl('https://elsewhere.test/x.png')).toBe('https://elsewhere.test/x.png')
  })

  it('returns null for bare paths when the R2 base is missing', () => {
    vi.stubEnv('VITE_MEDIA_BASE_URL', 'https://legacy.test/')
    expect(mediaUrl('entry/uuid-a.png')).toBeNull()
  })
})
```

- [ ] **Step 2: Run** → new tests FAIL. **Step 3: Implement** — replace the `mediaUrl` function in `media.ts`:

```ts
/**
 * Resolve a media `path` stored in the data_entry tables:
 * - `PUBLIC/...`  → legacy DOL CDN (`VITE_MEDIA_BASE_URL`)
 * - absolute URL  → returned as-is (defensive)
 * - anything else → R2 CDN (`VITE_MEDIA_R2_BASE_URL`)
 * This rule is shared with the other consumers of these tables.
 */
export function mediaUrl(path: string | null | undefined): string | null {
  if (!path || path.trim() === '') return null
  const clean = path.trim()
  if (/^https?:\/\//.test(clean)) return clean
  const env = import.meta.env as Record<string, string | undefined>
  const base = clean.startsWith('PUBLIC/')
    ? env.VITE_MEDIA_BASE_URL
    : env.VITE_MEDIA_R2_BASE_URL
  return joinMediaUrl(clean, base)
}
```

- [ ] **Step 4: Run** `pnpm test src/features/entry/data/media.test.ts` → all PASS (fix any stale fixture expecting the old behavior); `pnpm lint && pnpm build` → PASS. **Step 5: Commit**

```bash
git add src/features/entry/data/media.ts src/features/entry/data/media.test.ts
git commit -m "feat(entry): dual-CDN media URL resolution (legacy PUBLIC/ vs R2)"
```

---

### Task 3: `question-groups.ts` helpers

**Files:**
- Create: `src/features/entry/data/question-groups.ts`
- Create: `src/features/entry/data/question-groups.test.ts`

- [ ] **Step 1: Write the failing tests**:

```ts
import { describe, expect, it } from 'vitest'
import {
  OPTION_IDS,
  newGroup,
  newQuestion,
  normalizeQuestionGroups,
  plateToText,
} from './question-groups'

const q = (over: Record<string, unknown> = {}) => ({
  question_key: 'k',
  question_text: 'Q?',
  options: [
    { text: 'a', option_id: 'X', is_correct: true },
    { text: 'b', option_id: 'Y', is_correct: false },
  ],
  image: null,
  explanation: null,
  transcripts: null,
  is_valid: true,
  order_in_part: 99,
  start_time_in_milliseconds: 5,
  ...over,
})

describe('normalizeQuestionGroups', () => {
  it('recomputes orders, counts and cumulative ranges across groups', () => {
    const { groups, totalQuestions } = normalizeQuestionGroups([
      { group_key: 'g1', order: 9, questions: [q(), q()], extra: 'keep' },
      { group_key: 'g2', order: 0, questions: [q()] },
    ] as never)

    expect(totalQuestions).toBe(3)
    expect(groups[0]).toMatchObject({
      order: 0, number_of_question: 2, start_part_order: 1, end_part_order: 2,
      extra: 'keep',
    })
    expect(groups[1]).toMatchObject({
      order: 1, number_of_question: 1, start_part_order: 3, end_part_order: 3,
    })
    expect(groups[0].questions.map((x: { order_in_part: number }) => x.order_in_part)).toEqual([1, 2])
    expect(groups[1].questions[0].order_in_part).toBe(3)
  })

  it('reassigns option_id alphabetically and preserves question extras', () => {
    const { groups } = normalizeQuestionGroups([
      { group_key: 'g', questions: [q()] },
    ] as never)
    const opts = groups[0].questions[0].options
    expect(opts.map((o: { option_id: string }) => o.option_id)).toEqual(['A', 'B'])
    expect(groups[0].questions[0].start_time_in_milliseconds).toBe(5)
  })

  it('handles empty input', () => {
    expect(normalizeQuestionGroups([])).toEqual({ groups: [], totalQuestions: 0 })
  })
})

describe('templates', () => {
  it('newQuestion has 4 empty options, none correct, a fresh key', () => {
    const a = newQuestion()
    const b = newQuestion()
    expect(a.question_key).not.toBe(b.question_key)
    expect(a.options).toHaveLength(4)
    expect(a.options.every((o) => !o.is_correct)).toBe(true)
    expect(a.options.map((o) => o.option_id)).toEqual(['A', 'B', 'C', 'D'])
    expect(a.is_valid).toBe(true)
  })

  it('newGroup is empty and valid with a fresh key', () => {
    const g = newGroup()
    expect(g.questions).toEqual([])
    expect(g.group_valid).toBe(true)
    expect(g.group_key).toBeTruthy()
  })
})

describe('plateToText', () => {
  it('extracts text from serialized Plate JSON', () => {
    const raw = JSON.stringify([
      { type: 'p', children: [{ text: 'Hello ' }, { text: 'world', bold: true }] },
      { type: 'p', children: [{ text: 'Line 2' }] },
    ])
    expect(plateToText(raw)).toBe('Hello world\nLine 2')
  })

  it('returns trimmed raw string for non-JSON input', () => {
    expect(plateToText('  just text  ')).toBe('just text')
  })

  it('returns empty string for null/empty', () => {
    expect(plateToText(null)).toBe('')
    expect(plateToText('')).toBe('')
  })
})
```

- [ ] **Step 2: Run** → FAIL. **Step 3: Implement** `question-groups.ts`:

```ts
// Helpers for editing the `question_groups` jsonb of data_entry_part_test.
// All functions are pure; extra/unknown keys always pass through verbatim.

export const OPTION_IDS = ['A', 'B', 'C', 'D', 'E', 'F'] as const
export const MAX_OPTIONS = OPTION_IDS.length
export const MIN_OPTIONS = 2

type AnyOption = { option_id?: string | null } & Record<string, unknown>
type AnyQuestion = {
  options?: AnyOption[] | null
  order_in_part?: number | null
} & Record<string, unknown>
type AnyGroup = {
  questions?: AnyQuestion[] | null
  order?: number | null
  number_of_question?: number | null
  start_part_order?: number | null
  end_part_order?: number | null
} & Record<string, unknown>

/**
 * Recompute all derived ordering/count fields after edits:
 * group.order (0-based), question.order_in_part (1-based, continuous across
 * the whole part), option_id (A…F by index), number_of_question, and the
 * cumulative start/end_part_order per group.
 */
export function normalizeQuestionGroups(groups: AnyGroup[]): {
  groups: AnyGroup[]
  totalQuestions: number
} {
  let counter = 0
  const out = groups.map((group, gi) => {
    const start = counter + 1
    const questions = (group.questions ?? []).map((question) => ({
      ...question,
      order_in_part: ++counter,
      options: (question.options ?? []).map((option, oi) => ({
        ...option,
        option_id: OPTION_IDS[oi] ?? String(oi + 1),
      })),
    }))
    return {
      ...group,
      order: gi,
      questions,
      number_of_question: questions.length,
      start_part_order: start,
      end_part_order: counter,
    }
  })
  return { groups: out, totalQuestions: counter }
}

export function newQuestion() {
  return {
    question_key: crypto.randomUUID(),
    question_text: '',
    options: OPTION_IDS.slice(0, 4).map((id) => ({
      text: '',
      option_id: id as string,
      is_correct: false,
      display_type: null,
    })),
    image: null,
    explanation: null,
    transcripts: null,
    is_valid: true,
    order_in_part: 0,
    start_time_in_milliseconds: null,
    end_time_in_milliseconds: null,
  }
}

export function newGroup() {
  return {
    group_key: crypto.randomUUID(),
    group_title: '',
    passage: { title: null, body: null },
    image: null,
    questions: [] as ReturnType<typeof newQuestion>[],
    group_valid: true,
    has_image: false,
    part_type: null,
    has_passage_title: null,
    passage_templates: null,
    order: 0,
    number_of_question: 0,
    start_part_order: 0,
    end_part_order: 0,
  }
}

type PlateNode = { text?: unknown; children?: PlateNode[] }

/**
 * Best-effort plain-text preview of a serialized Plate rich-text document
 * (the `explanation` field). Never throws: non-JSON input is returned as-is.
 */
export function plateToText(raw: string | null | undefined): string {
  if (!raw) return ''
  let nodes: PlateNode[]
  try {
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return String(raw).trim()
    nodes = parsed as PlateNode[]
  } catch {
    return String(raw).trim()
  }
  const blockText = (node: PlateNode): string => {
    if (typeof node.text === 'string') return node.text
    return (node.children ?? []).map(blockText).join('')
  }
  return nodes.map(blockText).join('\n').trim()
}
```

- [ ] **Step 4: Run** → all PASS; `pnpm lint && pnpm build` → PASS. **Step 5: Commit**

```bash
git add src/features/entry/data/question-groups.ts src/features/entry/data/question-groups.test.ts
git commit -m "feat(entry): question-group normalization, templates and plate preview helpers"
```

---

### Task 4: Editable schemas + form fields + mappers

**Files:**
- Modify: `src/features/entry/data/detail-schema.ts`
- Modify: `src/features/entry/data/detail-schema.test.ts`

- [ ] **Step 1: Failing tests** — append to `detail-schema.test.ts`:

```ts
import {
  editableQuestionSchema,
  toFullTestDefaults,
  toFullTestPayload,
  fullTestFormSchema,
} from './detail-schema'

describe('media + question_groups in the part form', () => {
  it('defaults carry media objects and editable groups', () => {
    const row = partTestDetailSchema.parse(basePartRow)
    const defaults = toPartTestDefaults(row)
    expect(defaults.cover).toMatchObject({ path: 'PUBLIC/MEDIA/c.png' })
    expect(defaults.question_groups?.[0]?.questions?.[0]).toBeDefined()
    expect(defaults.question_groups?.[0]?.group_title).toBe('Group A')
  })

  it('payload normalizes groups and derives total_question from them', () => {
    const row = partTestDetailSchema.parse(basePartRow)
    const defaults = toPartTestDefaults(row)
    const values = partTestFormSchema.parse(defaults)
    const payload = toPartTestPayload(values)
    expect(payload.total_question).toBe(3) // 3 questions in the fixture group
    expect(payload.cover).toMatchObject({ path: 'PUBLIC/MEDIA/c.png' })
    const groups = payload.question_groups as Array<Record<string, unknown>>
    expect(groups[0].number_of_question).toBe(3)
    expect(groups[0].order).toBe(0)
  })

  it('keeps manual total_question when question_groups is null', () => {
    const row = partTestDetailSchema.parse({ ...basePartRow, question_groups: null })
    const values = partTestFormSchema.parse(toPartTestDefaults(row))
    const payload = toPartTestPayload(values)
    expect(payload.total_question).toBe(30)
    expect(payload.question_groups).toBeUndefined()
  })
})

describe('editableQuestionSchema validation', () => {
  const validQ = {
    question_key: 'k', question_text: 'Q?',
    options: [
      { text: 'a', option_id: 'A', is_correct: true },
      { text: 'b', option_id: 'B', is_correct: false },
    ],
  }

  it('accepts a valid question', () => {
    expect(() => editableQuestionSchema.parse(validQ)).not.toThrow()
  })

  it('rejects empty question_text, <2 options, and not-exactly-one correct', () => {
    expect(() => editableQuestionSchema.parse({ ...validQ, question_text: ' ' })).toThrow()
    expect(() =>
      editableQuestionSchema.parse({ ...validQ, options: [validQ.options[0]] })
    ).toThrow()
    expect(() =>
      editableQuestionSchema.parse({
        ...validQ,
        options: validQ.options.map((o) => ({ ...o, is_correct: false })),
      })
    ).toThrow()
  })
})

describe('full form cover field', () => {
  it('round-trips cover through defaults and payload', () => {
    const row = fullTestDetailSchema.parse({
      id: 'c0a8666f-0000-0000-0000-000000000002',
      base_id: null,
      name: 'Full Test 1',
      test_type: 'FT',
      level: 'TOEIC_600',
      base_source: null,
      cover: { name: 'ft.jpg', path: 'PUBLIC/MEDIA/ft.jpg' },
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
    const payload = toFullTestPayload(fullTestFormSchema.parse(toFullTestDefaults(row)))
    expect(payload.cover).toMatchObject({ name: 'ft.jpg', path: 'PUBLIC/MEDIA/ft.jpg' })
  })
})
```

- [ ] **Step 2: Run** → FAIL. **Step 3: Implement** in `detail-schema.ts`:

3a. Add editable group schemas (after the form-schema section header), importing `normalizeQuestionGroups` from `./question-groups`:

```ts
// ---------- editable question_groups (input == output, extras pass through) ----------

const mediaField = z.custom<MediaObject>().nullable().optional()

export const editableOptionSchema = z.looseObject({
  text: z.string(),
  option_id: z.string(),
  is_correct: z.boolean(),
})

export const editableQuestionSchema = z
  .looseObject({
    question_key: z.string(),
    question_text: z.string().trim().min(1, 'Question text is required'),
    options: z
      .array(editableOptionSchema)
      .min(2, 'At least 2 options required'),
    image: mediaField,
  })
  .refine((q) => q.options.filter((o) => o.is_correct).length === 1, {
    message: 'Chọn đúng một đáp án đúng',
    path: ['options'],
  })

export const editableQuestionGroupSchema = z.looseObject({
  group_key: z.string(),
  group_title: z.string().nullable(),
  passage: z
    .looseObject({
      title: z.string().nullable(),
      body: z.string().nullable(),
    })
    .nullable(),
  image: mediaField,
  questions: z
    .array(editableQuestionSchema)
    .min(1, 'Group cần ít nhất 1 câu hỏi'),
})
export type EditableQuestionGroup = z.infer<typeof editableQuestionGroupSchema>
```

(`MediaObject` import already exists via `mediaObjectSchema`; add `import { normalizeQuestionGroups } from './question-groups'` at top.)

3b. Extend `partTestFormSchema` with media + groups (these fields are input==output, no transform):

```ts
  cover: z.custom<MediaObject>().nullable(),
  ex_image: z.custom<MediaObject>().nullable(),
  audio: z.custom<MediaObject>().nullable(),
  question_groups: z.array(editableQuestionGroupSchema).nullable(),
```

Extend `fullTestFormSchema` with:

```ts
  cover: z.custom<MediaObject>().nullable(),
```

3c. Extend `toPartTestDefaults` return with:

```ts
    cover: row.cover ?? null,
    ex_image: row.ex_image ?? null,
    audio: row.audio ?? null,
    question_groups: row.question_groups
      ? row.question_groups.map((g) => ({
          ...g,
          group_title: g.group_title ?? '',
          passage: g.passage
            ? { ...g.passage, title: g.passage.title ?? null, body: g.passage.body ?? null }
            : { title: null, body: null },
          image: g.image ?? null,
          questions: (g.questions ?? []).map((q) => ({
            ...(q as Record<string, unknown>),
            question_text: String((q as Record<string, unknown>).question_text ?? ''),
            options: (((q as Record<string, unknown>).options as Array<Record<string, unknown>>) ?? []).map((o) => ({
              ...o,
              text: String(o.text ?? ''),
              option_id: String(o.option_id ?? ''),
              is_correct: Boolean(o.is_correct),
            })),
            image: (q as Record<string, unknown>).image ?? null,
          })),
        }))
      : null,
```

NOTE: the existing `partTestDetailSchema.question_groups` parses with `questionGroupPreviewSchema` (loose: group_title/number_of_question/questions of unknown). Tighten that preview schema's `questions` element from `z.unknown()` to a loose object so the mapping above is typed: change `questions: z.array(z.unknown()).nullable().optional()` to `questions: z.array(z.looseObject({})).nullable().optional()` and add `passage: z.looseObject({ title: z.string().nullable().optional(), body: z.string().nullable().optional() }).nullable().optional(), image: mediaObjectSchema.optional(), group_key: z.string().optional()`. Adjust the mapper code to the resulting types (prefer schema tightening over `as` casts where possible; keep casts minimal and localized).

3d. Extend `toPartTestDefaults`'s counterpart `toPartTestPayload`:

```ts
export function toPartTestPayload(values: PartTestFormValues) {
  const base = {
    /* ...existing fields unchanged... */
    cover: values.cover,
    ex_image: values.ex_image,
    audio: values.audio,
  }
  if (!values.question_groups) return base
  const normalized = normalizeQuestionGroups(
    values.question_groups.map((g) => ({
      ...g,
      group_title: g.group_title?.trim() === '' ? null : g.group_title,
      passage: g.passage
        ? {
            ...g.passage,
            title: g.passage.title?.trim() === '' ? null : g.passage.title,
            body: g.passage.body?.trim() === '' ? null : g.passage.body,
          }
        : null,
    }))
  )
  return {
    ...base,
    question_groups: normalized.groups,
    total_question: normalized.totalQuestions,
  }
}
```

(Note `total_question` from groups REPLACES the manual numeric field in `base` when groups exist.) Extend `toFullTestDefaults` with `cover: row.cover ?? null` and `toFullTestPayload` with `cover: values.cover`.

- [ ] **Step 4: Run** `pnpm test src/features/entry/data/` → all PASS; `pnpm lint && pnpm build` → PASS (part/full pages still compile since new defaults fields are additive; the form components don't reference them yet). **Step 5: Commit**

```bash
git add src/features/entry/data/detail-schema.ts src/features/entry/data/detail-schema.test.ts
git commit -m "feat(entry): media and editable question_groups in detail form schemas"
```

---

### Task 5: Interactive `EntryMediaSection`

**Files:**
- Rewrite: `src/features/entry/components/detail/entry-media-section.tsx`
- Modify: `src/features/entry/components/detail/entry-media-section.test.tsx`

- [ ] **Step 1: Failing tests** — replace the test file content:

```tsx
import { afterEach, describe, expect, it, vi } from 'vitest'
import { render } from 'vitest-browser-react'

const uploadMediaMock = vi.fn()
vi.mock('../../data/upload', async (importOriginal) => {
  const mod = await importOriginal<typeof import('../../data/upload')>()
  return {
    ...mod,
    isUploadConfigured: () => true,
    uploadMedia: (...args: unknown[]) => uploadMediaMock(...args),
  }
})

import { EntryMediaSection } from './entry-media-section'

afterEach(() => {
  vi.unstubAllEnvs()
  uploadMediaMock.mockReset()
})

describe('EntryMediaSection', () => {
  it('renders an image preview when the item has a path', async () => {
    vi.stubEnv('VITE_MEDIA_BASE_URL', 'https://cdn.test/')
    const { container } = await render(
      <EntryMediaSection
        canEdit
        items={[{ label: 'Cover', media: { name: 'c.png', path: 'PUBLIC/c.png' }, kind: 'image' }]}
      />
    )
    expect(container.querySelector('img')?.getAttribute('src')).toBe(
      'https://cdn.test/PUBLIC/c.png'
    )
  })

  it('disables Replace when no onReplaced handler is provided', async () => {
    const { getByRole } = await render(
      <EntryMediaSection canEdit items={[{ label: 'Cover', media: null, kind: 'image' }]} />
    )
    await expect.element(getByRole('button', { name: /replace/i })).toBeDisabled()
  })

  it('uploads the picked file and calls onReplaced with a merged media object', async () => {
    uploadMediaMock.mockResolvedValue({ path: 'entry/u-new.png', size: 7, contentType: 'image/png' })
    const onReplaced = vi.fn()
    const { getByRole, container } = await render(
      <EntryMediaSection
        canEdit
        items={[{
          label: 'Cover',
          media: { name: 'old.png', path: 'PUBLIC/old.png', alt: '', uploadedDate: 1 },
          kind: 'image',
          onReplaced,
        }]}
      />
    )
    const btn = getByRole('button', { name: /replace/i })
    await expect.element(btn).toBeEnabled()

    const input = container.querySelector('input[type="file"]') as HTMLInputElement
    const file = new File(['x'], 'new.png', { type: 'image/png' })
    const dt = new DataTransfer()
    dt.items.add(file)
    input.files = dt.files
    input.dispatchEvent(new Event('change', { bubbles: true }))

    await vi.waitFor(() => expect(onReplaced).toHaveBeenCalled())
    expect(onReplaced.mock.calls[0][0]).toMatchObject({
      name: 'new.png',
      path: 'entry/u-new.png',
      size: 7,
      uploadedDate: 1, // shape preserved from the existing object
    })
  })

  it('does not render Replace when canEdit is false', async () => {
    const { getByRole } = await render(
      <EntryMediaSection
        canEdit={false}
        items={[{ label: 'Cover', media: null, kind: 'image', onReplaced: vi.fn() }]}
      />
    )
    expect(getByRole('button', { name: /replace/i }).query()).toBeNull()
  })
})
```

- [ ] **Step 2: Run** → FAIL. **Step 3: Rewrite the component**:

```tsx
import { useRef, useState } from 'react'
import { Image as ImageIcon, Loader2, Paperclip } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { mediaUrl } from '../../data/media'
import { type MediaObject } from '../../data/schema'
import { isUploadConfigured, mergeMediaObject, uploadMedia } from '../../data/upload'

export type MediaItem = {
  label: string
  media: MediaObject | undefined
  kind: 'image' | 'file'
  /** Defaults: image/* for images, audio/* for files. */
  accept?: string
  /** When provided (and canEdit), Replace becomes active. */
  onReplaced?: (media: NonNullable<MediaObject>) => void
}

type EntryMediaSectionProps = {
  items: MediaItem[]
  canEdit?: boolean
}

export function EntryMediaSection({ items, canEdit }: EntryMediaSectionProps) {
  return (
    <TooltipProvider>
      <Card>
        <CardHeader>
          <CardTitle>Media</CardTitle>
        </CardHeader>
        <CardContent className='flex flex-col gap-4'>
          {items.map((item) => (
            <MediaRow key={item.label} item={item} canEdit={!!canEdit} />
          ))}
        </CardContent>
      </Card>
    </TooltipProvider>
  )
}

function MediaRow({ item, canEdit }: { item: MediaItem; canEdit: boolean }) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const src = mediaUrl(item.media?.path)
  const configured = isUploadConfigured()
  const enabled = configured && !!item.onReplaced && !busy

  const pick = async (file: File | undefined) => {
    if (!file || !item.onReplaced) return
    setBusy(true)
    try {
      const uploaded = await uploadMedia(file)
      item.onReplaced(mergeMediaObject(item.media, file, uploaded))
      toast.success(`${item.label}: đã upload ${file.name}`)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Upload failed')
    } finally {
      setBusy(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  const button = (
    <Button
      variant='outline'
      size='sm'
      disabled={!enabled}
      onClick={() => inputRef.current?.click()}
    >
      {busy && <Loader2 className='me-1 size-3.5 animate-spin' />}
      Replace
    </Button>
  )

  return (
    <div className='flex items-center gap-3'>
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
      {canEdit && (
        <>
          <input
            ref={inputRef}
            type='file'
            className='hidden'
            accept={item.accept ?? (item.kind === 'image' ? 'image/*' : 'audio/*')}
            onChange={(e) => void pick(e.target.files?.[0])}
          />
          {configured ? (
            button
          ) : (
            <Tooltip>
              <TooltipTrigger asChild>
                <span tabIndex={0}>{button}</span>
              </TooltipTrigger>
              <TooltipContent>Upload chưa được cấu hình</TooltipContent>
            </Tooltip>
          )}
        </>
      )}
    </div>
  )
}
```

- [ ] **Step 4: Run** the test file → 4 PASS. NOTE: the part/full detail pages still call `<EntryMediaSection items={...} />` without `canEdit` — they compile (prop optional) but Replace is hidden; Task 6 wires them. `pnpm lint && pnpm build` → PASS. **Step 5: Commit**

```bash
git add src/features/entry/components/detail/entry-media-section.tsx src/features/entry/components/detail/entry-media-section.test.tsx
git commit -m "feat(entry): working Replace buttons with R2 upload in media section"
```

---

### Task 6: Wire media into both detail forms + drop knip ignore

**Files:**
- Modify: `src/features/entry/components/detail/part-test-detail.tsx`
- Modify: `src/features/entry/components/detail/full-test-detail.tsx`
- Modify: `knip.config.ts`

- [ ] **Step 1: Part form** — replace the `<EntryMediaSection ... />` usage with form-driven values:

```tsx
          <EntryMediaSection
            canEdit={canEdit && !updateTest.isPending}
            items={[
              {
                label: 'Cover',
                media: form.watch('cover') ?? undefined,
                kind: 'image',
                onReplaced: (m) => form.setValue('cover', m, { shouldDirty: true }),
              },
              {
                label: 'Example image',
                media: form.watch('ex_image') ?? undefined,
                kind: 'image',
                onReplaced: (m) => form.setValue('ex_image', m, { shouldDirty: true }),
              },
              {
                label: 'Audio',
                media: form.watch('audio') ?? undefined,
                kind: 'file',
                onReplaced: (m) => form.setValue('audio', m, { shouldDirty: true }),
              },
            ]}
          />
```

- [ ] **Step 2: Full form** — same pattern, cover only.

- [ ] **Step 3: knip** — remove the `'src/features/entry/data/upload.ts'` ignore entry (+ its comment) from `knip.config.ts`; run `pnpm knip` → upload exports no longer flagged (all consumed); only pre-existing findings remain.

- [ ] **Step 4:** `pnpm lint && pnpm build && pnpm test src/features/entry` → all PASS. **Step 5: Commit**

```bash
git add src/features/entry/components/detail/part-test-detail.tsx src/features/entry/components/detail/full-test-detail.tsx knip.config.ts
git commit -m "feat(entry): media replacement saves through detail forms"
```

---

### Task 7: Question-group editor components

**Files:**
- Create: `src/features/entry/components/detail/question-group-editor.tsx`
- Create: `src/features/entry/components/detail/question-group-editor.test.tsx`

The editor operates on the part form's `question_groups` field via RHF context. To keep prop surfaces small, components receive the typed `control`/`form` from the page (same `<T, TT>` generic + cast pattern as `detail-fields.tsx`). Compose from:

- `GroupsNav({ groups, selected, onSelect, onAddGroup, canEdit })` — sidebar card: "Thông tin chung" entry + one button per group (`group_title || 'Group N'` + live count), highlight via `variant`, footer "+ Thêm group".
- `GroupPanel({ form, groupIndex, onRemoveGroup, disabled })` — group_title TextField, passage title/body fields, group image row (reuses the upload mechanics: a one-item `EntryMediaSection`), question list via `useFieldArray({ control, name: \`question_groups.${groupIndex}.questions\` })`, "+ Thêm câu hỏi" (appends `newQuestion()`), remove-group button opening `ConfirmDialog`.
- `QuestionCard({ form, groupIndex, questionIndex, onRemove, disabled })` — question_text TextareaField, image (one-item EntryMediaSection), `OptionsEditor`, read-only timing line (`formatDuration` on start/end ms when present), explanation preview (`plateToText`, `whitespace-pre-line`, max-h with overflow, italic "Chỉnh sửa explanation ở phase sau").
- `OptionsEditor({ form, groupIndex, questionIndex, disabled })` — `useFieldArray` over options; each row: `<RadioGroup>`-less manual radio (a `<input type='radio'>` or shadcn RadioGroup with `value=String(index)`) bound so checking row i sets `options[j].is_correct = i===j` for all j (use `form.setValue` over the options array with `shouldDirty: true`); text Input bound to `options.${i}.text`; remove button (disabled at MIN_OPTIONS); "+ Thêm option" (disabled at MAX_OPTIONS, appends `{text:'', option_id:'', is_correct:false, display_type:null}`).

Exact implementation is left to standard RHF patterns BUT the following behaviors are contractual (tests below assert them):

1. Selecting the correct radio on row B turns off row A (single correct).
2. Add question appends a card with 4 empty options; remove question deletes the card; the GroupsNav count text updates live (it must read from `useWatch`/`form.watch`, not the row prop).
3. Field errors surface: saving with an empty `question_text` shows the zod message under the field (FormMessage via the shared field helpers).
4. Group remove asks for confirmation (ConfirmDialog with `destructive`).

- [ ] **Step 1: Write the component tests** (after reading `part-test-detail.test.tsx` for the mock pattern). Mount a small harness instead of the whole page:

```tsx
// Harness: a real RHF form around just the editor pieces.
function Harness({ groups }: { groups: EditableQuestionGroup[] }) {
  const form = useForm<PartTestFormInput, unknown, PartTestFormValues>({
    resolver: zodResolver(partTestFormSchema),
    defaultValues: { ...someMinimalDefaults, question_groups: groups },
  })
  const [selected, setSelected] = useState<number | 'general'>(0)
  return (
    <Form {...form}>
      <GroupsNav ... />
      {typeof selected === 'number' && <GroupPanel form={form} groupIndex={selected} ... />}
    </Form>
  )
}
```

Write `someMinimalDefaults` concretely (all the string fields '' / valid enum values, media nulls). Three tests:

1. `renders the selected group's questions and options` — pass one group with one question (2 options, A correct) → question textarea visible with value, both option text inputs present, radio A checked.
2. `picking another option enforces single-correct` — click radio B → radio A unchecked, radio B checked.
3. `add question appends a card and updates the nav count` — click "+ Thêm câu hỏi" → a second question card appears; the nav badge text contains "2 câu".

- [ ] **Step 2: Run** → FAIL (module missing). **Step 3: Implement** `question-group-editor.tsx` per the contract above. Reuse `TextField`/`TextareaField` from `./detail-fields` and `EntryMediaSection`/`MediaItem` for images; `newQuestion`, `MIN_OPTIONS`, `MAX_OPTIONS`, `plateToText` from `../../data/question-groups`; `ConfirmDialog` from `@/components/confirm-dialog`; `formatDuration` from `../../data/format`. Use the established `Control` cast pattern when handing `form.control` to `useFieldArray` typed against the input type.

- [ ] **Step 4: Run** the test file → 3 PASS; `pnpm lint && pnpm build` → PASS. **Step 5: Commit**

```bash
git add src/features/entry/components/detail/question-group-editor.tsx src/features/entry/components/detail/question-group-editor.test.tsx
git commit -m "feat(entry): question group editor with options, add/remove and live nav"
```

---

### Task 8: Integrate the editor into the part-test page

**Files:**
- Modify: `src/features/entry/components/detail/part-test-detail.tsx`
- Modify: `src/features/entry/components/detail/part-test-detail.test.tsx`

- [ ] **Step 1: Replace `GroupsSidebar` with `GroupsNav`** (delete the old read-only sidebar component):

```tsx
const [section, setSection] = useState<number | 'general'>('general')
const watchedGroups = form.watch('question_groups')
```

- sidebar prop: `<GroupsNav groups={watchedGroups ?? []} selected={section} onSelect={setSection} onAddGroup={canEdit ? addGroup : undefined} canEdit={canEdit} />` where `addGroup` appends `newGroup()` via a `useFieldArray({ control, name: 'question_groups' })` instance owned by the page and selects the new index.
- main content: wrap the four existing general Cards + EntryMediaSection in `<div className={section === 'general' ? 'flex flex-col gap-6' : 'hidden'}>`; below it render `{typeof section === 'number' && watchedGroups?.[section] && <GroupPanel form={form} groupIndex={section} disabled={disabled} onRemoveGroup={() => removeGroup(section)} />}` where `removeGroup` removes via the field array and resets selection to `'general'`.
- The **Numbers** card's `total_question` input becomes disabled with a description when groups exist: `disabled={disabled || (watchedGroups?.length ?? 0) > 0}` plus help text "Tự tính từ question groups khi lưu".
- On save validation failure (`form.handleSubmit`'s onInvalid callback), if `errors.question_groups` exists, find the first group index with errors and `setSection(thatIndex)`; also toast.error('Form có lỗi — kiểm tra các trường đánh dấu đỏ').

- [ ] **Step 2: Update the page tests** — the old test asserting the read-only sidebar text 'Group A — 3 câu' must now click the nav: assert the nav button exists ('Group A' + '3 câu'), click it, and assert the question textarea from the fixture renders. Keep the pristine-Save and non-admin tests passing (adjust queries if labels moved).

- [ ] **Step 3: Run** `pnpm test src/features/entry/components/detail/` → all PASS; `pnpm lint && pnpm build` → PASS. **Step 4: Commit**

```bash
git add src/features/entry/components/detail/part-test-detail.tsx src/features/entry/components/detail/part-test-detail.test.tsx
git commit -m "feat(entry): selectable group panels with add/remove on part-test page"
```

---

### Task 9: Final gates

- [ ] `pnpm lint && pnpm build` → PASS
- [ ] `pnpm test src/features/entry src/hooks` → all PASS
- [ ] `pnpm format` → if changed: re-run lint+build, commit `style: format entry upload/editor changes`
- [ ] `pnpm knip` → no NEW findings (upload.ts ignore already removed in Task 6; `MediaItem` is exported again and consumed by question-group-editor — verify; if `editableOptionSchema`/`EditableQuestionGroup` etc. are flagged, inline or un-export)
- [ ] Browser verification is run by the controller afterwards (upload real file → R2 URL renders; group edit → save → DB jsonb updated; add/remove question → orders/totals recomputed; revert test data).

## Self-review notes (applied)

- Spec §1→T1/T2, §2→T1/T5/T6, §3→T3/T4/T7/T8, §4→T6, §5→T1/T5 (toasts) + existing conflict path, §6→tests in every task + controller verification.
- Deviation from spec documented in header (render-only-selected-group).
- Type names consistent: `UploadedFile`, `MediaItem`, `EditableQuestionGroup`, `newQuestion`/`newGroup`, `MIN_OPTIONS`/`MAX_OPTIONS`, `plateToText`, `normalizeQuestionGroups`.
- Task 7 deliberately specifies a behavioral contract + harness rather than full JSX (the file is large; the contract + tests pin the behavior; reviewers verify against the contract).
