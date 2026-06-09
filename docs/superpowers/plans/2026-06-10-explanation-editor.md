# Explanation Editor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A rich-text dialog editor for the per-question `explanation` field (Plate/Slate JSON string) in the part-test detail view, preserving all formatting keys it cannot edit.

**Architecture:** Plain Slate editor in a dialog. Pure helpers (`parseExplanation`/`serializeExplanation`) convert between the stored JSON string and Slate nodes; headless command helpers implement toolbar actions; the dialog wires both into the existing react-hook-form via `form.setValue(..., { shouldDirty: true })`. Unknown marks/blocks pass through untouched (Slate keeps unknown node properties).

**Tech Stack:** slate, slate-react, slate-history (new deps), React 19, shadcn ui (Dialog/Popover/Select/Button), vitest browser (Chromium), react-hook-form + zod (existing).

**Spec:** `docs/superpowers/specs/2026-06-10-explanation-editor-design.md`

**Notes for the executor:**
- Package manager is **pnpm**. Tests run in real Chromium: `pnpm test <file>`.
- The `search-provider` test fails pre-existing on `develop` — ignore that one failure in full-suite runs; everything else must pass.
- Branch off `develop` (integration branch). The main checkout may be shared by parallel sessions — prefer a worktree under `.claude/worktrees/`.

---

### Task 1: Install Slate dependencies

**Files:**
- Modify: `package.json`, `pnpm-lock.yaml` (via pnpm)

- [ ] **Step 1: Install**

```bash
pnpm add slate slate-react slate-history
```

- [ ] **Step 2: Verify the app still typechecks/builds**

Run: `pnpm build`
Expected: exits 0. If pnpm warns about an unmet peer `slate-dom`, run `pnpm add slate-dom` and, if `pnpm knip` later flags it as unused, add `slate-dom` to `ignoreDependencies` in `knip.config.ts`.

- [ ] **Step 3: Commit**

```bash
git add package.json pnpm-lock.yaml
git commit -m "chore(entry): add slate editor dependencies"
```

---

### Task 2: `explanation.ts` — parse/serialize helpers + palettes

**Files:**
- Create: `src/features/entry/data/explanation.ts`
- Test: `src/features/entry/data/explanation.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
// src/features/entry/data/explanation.test.ts
import { describe, expect, it } from 'vitest'
import { parseExplanation, serializeExplanation } from './explanation'

// Mirrors real DB data: ids, unknown marks (formula, TEXT_COLOR, firstDelete),
// unknown block (borderShading), nested ul > li > p.
const richDoc = [
  {
    id: 'blk1',
    type: 'p',
    children: [
      { text: 'Câu hỏi:', bold: true },
      { text: ' keyword ', colorKey: 'blue100', annotationText: 'S' },
      { text: 'x = y', formula: true, TEXT_COLOR: '{"colorKey": "red100"}' },
      { text: 'gone', firstDelete: true },
    ],
  },
  {
    id: 'blk2',
    type: 'borderShading',
    children: [
      {
        id: 'blk3',
        type: 'p',
        children: [{ text: 'inside box', highlightKey: 'green40' }],
      },
    ],
  },
  {
    type: 'ul',
    children: [
      { type: 'li', children: [{ type: 'p', children: [{ text: 'item' }] }] },
    ],
  },
]

describe('parseExplanation', () => {
  it('returns a parsed Plate document as-is', () => {
    expect(parseExplanation(JSON.stringify(richDoc))).toEqual(richDoc)
  })

  it('wraps a plain (non-JSON) string in a paragraph', () => {
    expect(parseExplanation('chỉ là text ')).toEqual([
      { type: 'p', children: [{ text: 'chỉ là text' }] },
    ])
  })

  it('returns one empty paragraph for null/empty', () => {
    const empty = [{ type: 'p', children: [{ text: '' }] }]
    expect(parseExplanation(null)).toEqual(empty)
    expect(parseExplanation('')).toEqual(empty)
    expect(parseExplanation(undefined)).toEqual(empty)
  })

  it('returns fresh objects each call (no shared mutable state)', () => {
    expect(parseExplanation(null)).not.toBe(parseExplanation(null))
    expect(parseExplanation(null)[0]).not.toBe(parseExplanation(null)[0])
  })
})

describe('serializeExplanation', () => {
  it('round-trips an untouched document byte-identically', () => {
    const raw = JSON.stringify(richDoc)
    expect(serializeExplanation(parseExplanation(raw))).toBe(raw)
  })

  it('serializes an empty document to null', () => {
    expect(serializeExplanation([{ type: 'p', children: [{ text: '' }] }])).toBeNull()
    expect(
      serializeExplanation([
        { type: 'p', children: [{ text: '  ' }] },
        { type: 'p', children: [{ text: '' }] },
      ])
    ).toBeNull()
  })

  it('upgrades a plain string to Plate JSON', () => {
    const out = serializeExplanation(parseExplanation('plain'))
    expect(out).toBe(JSON.stringify([{ type: 'p', children: [{ text: 'plain' }] }]))
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test src/features/entry/data/explanation.test.ts`
Expected: FAIL — cannot resolve `./explanation`.

- [ ] **Step 3: Write the implementation**

```ts
// src/features/entry/data/explanation.ts
// Helpers for the `explanation` field: a serialized Plate/Slate rich-text
// document. The learner app consumes this JSON, so parse/serialize must keep
// every node property — including marks this admin cannot edit — untouched.
import type { BaseEditor } from 'slate'
import type { HistoryEditor } from 'slate-history'
import type { ReactEditor } from 'slate-react'

// Loose node shapes: unknown properties (formula, iconKey, TEXT_COLOR, ids…)
// ride along verbatim.
export type ExplanationElement = {
  type?: string
  children: ExplanationNode[]
  [key: string]: unknown
}
export type ExplanationText = { text: string; [key: string]: unknown }
export type ExplanationNode = ExplanationElement | ExplanationText

declare module 'slate' {
  interface CustomTypes {
    Editor: BaseEditor & ReactEditor & HistoryEditor
    Element: ExplanationElement
    Text: ExplanationText
  }
}

/**
 * Stored string → Slate document. Valid JSON arrays are used as-is; plain
 * strings become a single paragraph; null/empty becomes one empty paragraph.
 */
export function parseExplanation(
  raw: string | null | undefined
): ExplanationNode[] {
  if (!raw || raw.trim() === '')
    return [{ type: 'p', children: [{ text: '' }] }]
  try {
    const parsed = JSON.parse(raw) as unknown
    if (Array.isArray(parsed) && parsed.length > 0)
      return parsed as ExplanationNode[]
  } catch {
    // not JSON — treat as plain text below
  }
  return [{ type: 'p', children: [{ text: raw.trim() }] }]
}

const hasContent = (node: ExplanationNode): boolean => {
  if (typeof (node as ExplanationText).text === 'string')
    return (node as ExplanationText).text.trim() !== ''
  return ((node as ExplanationElement).children ?? []).some(hasContent)
}

/** Slate document → stored string; an all-empty document stores null. */
export function serializeExplanation(value: ExplanationNode[]): string | null {
  return value.some(hasContent) ? JSON.stringify(value) : null
}

// Palettes observed in production data. CSS values are an admin-side
// approximation — the saved key is the contract with the learner app.
export const COLOR_KEYS = [
  { key: 'blue100', css: '#2f80ed', label: 'Xanh dương' },
  { key: 'green40', css: '#27ae60', label: 'Xanh lá' },
  { key: 'yellow40', css: '#b8860b', label: 'Vàng' },
  { key: 'purple100', css: '#9b51e0', label: 'Tím' },
  { key: 'primary100', css: '#e8590c', label: 'Cam' },
] as const

export const HIGHLIGHT_KEYS = [
  { key: 'green40', css: '#b7efc5', label: 'Nền xanh lá' },
  { key: 'yellow40', css: '#fff3b0', label: 'Nền vàng' },
  { key: 'primary40', css: '#ffd9b3', label: 'Nền cam' },
  { key: 'blue40', css: '#cfe3ff', label: 'Nền xanh dương' },
  { key: 'purple40', css: '#e5d4f8', label: 'Nền tím' },
] as const

export const colorCss = (key: unknown): string | undefined =>
  COLOR_KEYS.find((c) => c.key === key)?.css

export const highlightCss = (key: unknown): string | undefined =>
  HIGHLIGHT_KEYS.find((c) => c.key === key)?.css
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test src/features/entry/data/explanation.test.ts`
Expected: PASS (8 tests).

- [ ] **Step 5: Commit**

```bash
git add src/features/entry/data/explanation.ts src/features/entry/data/explanation.test.ts
git commit -m "feat(entry): explanation parse/serialize helpers with pass-through"
```

---

### Task 3: `explanation-commands.ts` — headless editor commands

Toolbar logic as pure functions on a Slate editor, unit-tested without DOM.

**Files:**
- Create: `src/features/entry/components/detail/explanation-commands.ts`
- Test: `src/features/entry/components/detail/explanation-commands.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
// src/features/entry/components/detail/explanation-commands.test.ts
import { createEditor, Transforms, type Descendant } from 'slate'
import { describe, expect, it } from 'vitest'
import {
  clearMark,
  currentBlockType,
  isBlockActive,
  isMarkActive,
  setBlockType,
  setMark,
  toggleList,
  toggleMark,
} from './explanation-commands'

const makeEditor = (children: Descendant[]) => {
  const editor = createEditor()
  editor.children = children
  return editor
}

const selectAllOfFirstText = (editor: ReturnType<typeof createEditor>, len: number) =>
  Transforms.select(editor, {
    anchor: { path: [0, 0], offset: 0 },
    focus: { path: [0, 0], offset: len },
  })

describe('marks', () => {
  it('toggleMark adds and removes bold on the selection', () => {
    const editor = makeEditor([{ type: 'p', children: [{ text: 'hello world' }] }])
    selectAllOfFirstText(editor, 5)
    toggleMark(editor, 'bold')
    expect(editor.children).toEqual([
      {
        type: 'p',
        children: [{ text: 'hello', bold: true }, { text: ' world' }],
      },
    ])
    expect(isMarkActive(editor, 'bold')).toBe(true)
    toggleMark(editor, 'bold')
    expect(isMarkActive(editor, 'bold')).toBe(false)
  })

  it('setMark/clearMark write and remove a valued mark', () => {
    const editor = makeEditor([{ type: 'p', children: [{ text: 'màu' }] }])
    selectAllOfFirstText(editor, 3)
    setMark(editor, 'colorKey', 'blue100')
    expect(editor.children).toEqual([
      { type: 'p', children: [{ text: 'màu', colorKey: 'blue100' }] },
    ])
    clearMark(editor, 'colorKey')
    expect(editor.children).toEqual([{ type: 'p', children: [{ text: 'màu' }] }])
  })

  it('leaves unknown marks on untouched text alone', () => {
    const editor = makeEditor([
      {
        type: 'p',
        children: [
          { text: 'aa' },
          { text: 'formula', formula: true, TEXT_COLOR: 'x' },
        ],
      },
    ])
    selectAllOfFirstText(editor, 2)
    toggleMark(editor, 'bold')
    expect(editor.children[0]).toMatchObject({
      children: [
        { text: 'aa', bold: true },
        { text: 'formula', formula: true, TEXT_COLOR: 'x' },
      ],
    })
  })
})

describe('blocks', () => {
  it('setBlockType switches p ↔ h2 and keeps extra props (id)', () => {
    const editor = makeEditor([
      { id: 'keep', type: 'p', children: [{ text: 'tiêu đề' }] },
    ])
    selectAllOfFirstText(editor, 3)
    setBlockType(editor, 'h2')
    expect(editor.children).toEqual([
      { id: 'keep', type: 'h2', children: [{ text: 'tiêu đề' }] },
    ])
    expect(currentBlockType(editor)).toBe('h2')
    setBlockType(editor, 'p')
    expect(currentBlockType(editor)).toBe('p')
  })

  it('toggleList wraps a paragraph into ul > li > p and back', () => {
    const editor = makeEditor([{ type: 'p', children: [{ text: 'item' }] }])
    selectAllOfFirstText(editor, 4)
    toggleList(editor, 'ul')
    expect(editor.children).toEqual([
      {
        type: 'ul',
        children: [
          { type: 'li', children: [{ type: 'p', children: [{ text: 'item' }] }] },
        ],
      },
    ])
    expect(isBlockActive(editor, 'ul')).toBe(true)
    toggleList(editor, 'ul')
    expect(editor.children).toEqual([{ type: 'p', children: [{ text: 'item' }] }])
  })

  it('switching ul → ol rewraps instead of nesting', () => {
    const editor = makeEditor([{ type: 'p', children: [{ text: 'item' }] }])
    selectAllOfFirstText(editor, 4)
    toggleList(editor, 'ul')
    // selection still inside the item's text node
    toggleList(editor, 'ol')
    expect(editor.children).toEqual([
      {
        type: 'ol',
        children: [
          { type: 'li', children: [{ type: 'p', children: [{ text: 'item' }] }] },
        ],
      },
    ])
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test src/features/entry/components/detail/explanation-commands.test.ts`
Expected: FAIL — cannot resolve `./explanation-commands`.

- [ ] **Step 3: Write the implementation**

```ts
// src/features/entry/components/detail/explanation-commands.ts
// Headless Slate commands behind the explanation toolbar. All functions
// operate on editor.selection, so they keep working while DOM focus is in a
// popover input.
import { Editor, Element as SlateElement, Transforms } from 'slate'

const LIST_TYPES = ['ul', 'ol']
const TEXT_BLOCK_TYPES = ['p', 'h1', 'h2', 'h3']

const isType = (types: string[]) => (n: unknown) =>
  !Editor.isEditor(n) &&
  SlateElement.isElement(n) &&
  types.includes((n.type as string) ?? '')

export function isMarkActive(editor: Editor, key: string): boolean {
  const marks = Editor.marks(editor) as Record<string, unknown> | null
  return Boolean(marks?.[key])
}

export function toggleMark(editor: Editor, key: string) {
  if (isMarkActive(editor, key)) Editor.removeMark(editor, key)
  else Editor.addMark(editor, key, true)
}

export function setMark(editor: Editor, key: string, value: unknown) {
  Editor.addMark(editor, key, value)
}

export function clearMark(editor: Editor, key: string) {
  Editor.removeMark(editor, key)
}

export function isBlockActive(editor: Editor, type: string): boolean {
  const { selection } = editor
  if (!selection) return false
  const [match] = Editor.nodes(editor, {
    at: Editor.unhangRange(editor, selection),
    match: isType([type]),
  })
  return Boolean(match)
}

/** Text-block type under the selection; defaults to 'p'. */
export function currentBlockType(editor: Editor): string {
  const { selection } = editor
  if (!selection) return 'p'
  const [match] = Editor.nodes(editor, {
    at: Editor.unhangRange(editor, selection),
    match: isType(TEXT_BLOCK_TYPES),
  })
  return ((match?.[0] as SlateElement | undefined)?.type as string) ?? 'p'
}

export function setBlockType(editor: Editor, type: string) {
  Transforms.setNodes(editor, { type }, { match: isType(TEXT_BLOCK_TYPES) })
}

export function toggleList(editor: Editor, type: 'ul' | 'ol') {
  const active = isBlockActive(editor, type)
  // Lift out of any current list (li first, then the ul/ol wrapper).
  Transforms.unwrapNodes(editor, { match: isType(['li']), split: true })
  Transforms.unwrapNodes(editor, { match: isType(LIST_TYPES), split: true })
  if (active) return
  // Wrap each selected text block in its own li (reverse order keeps the
  // earlier paths stable), then wrap the run of li's in one list element.
  const blocks = Array.from(
    Editor.nodes(editor, { match: isType(TEXT_BLOCK_TYPES) })
  )
  for (const [, path] of blocks.reverse()) {
    Transforms.wrapNodes(editor, { type: 'li', children: [] }, { at: path })
  }
  Transforms.wrapNodes(editor, { type, children: [] })
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test src/features/entry/components/detail/explanation-commands.test.ts`
Expected: PASS (6 tests). If the `switching ul → ol` test fails on selection collapse after unwrapping, debug with `console.log(JSON.stringify(editor.children))` after each transform — the unwraps must leave the paragraph selected.

- [ ] **Step 5: Commit**

```bash
git add src/features/entry/components/detail/explanation-commands.ts src/features/entry/components/detail/explanation-commands.test.ts
git commit -m "feat(entry): headless slate commands for explanation toolbar"
```

---

### Task 4: `ExplanationEditorDialog` component

**Files:**
- Create: `src/features/entry/components/detail/explanation-editor-dialog.tsx`
- Test: `src/features/entry/components/detail/explanation-editor-dialog.test.tsx`

- [ ] **Step 1: Write the failing tests**

```tsx
// src/features/entry/components/detail/explanation-editor-dialog.test.tsx
import { useState } from 'react'
import { describe, expect, it } from 'vitest'
import { userEvent } from '@vitest/browser/context'
import { render } from 'vitest-browser-react'
import { ExplanationEditorDialog } from './explanation-editor-dialog'

const richDoc = [
  {
    id: 'blk1',
    type: 'p',
    children: [
      { text: 'Câu hỏi:', bold: true },
      { text: ' phần thường ' },
      { text: 'x=y', formula: true, TEXT_COLOR: '{"colorKey": "red100"}' },
    ],
  },
  {
    id: 'blk2',
    type: 'borderShading',
    children: [{ type: 'p', children: [{ text: 'trong khung' }] }],
  },
]

function Harness({
  initial,
  onSave,
}: {
  initial: string | null
  onSave: (v: string | null) => void
}) {
  const [open, setOpen] = useState(true)
  return (
    <ExplanationEditorDialog
      open={open}
      onOpenChange={setOpen}
      value={initial}
      onSave={onSave}
    />
  )
}

describe('ExplanationEditorDialog', () => {
  it('renders the document and saves it unchanged when untouched', async () => {
    const raw = JSON.stringify(richDoc)
    let saved: string | null | undefined
    const screen = await render(
      <Harness initial={raw} onSave={(v) => (saved = v)} />
    )
    await expect
      .element(screen.getByText('trong khung'))
      .toBeInTheDocument()
    await screen.getByRole('button', { name: /^lưu$/i }).click()
    expect(saved).toBe(raw)
  })

  it('keeps unknown marks when other text is edited', async () => {
    const raw = JSON.stringify(richDoc)
    let saved: string | null | undefined
    const screen = await render(
      <Harness initial={raw} onSave={(v) => (saved = v)} />
    )
    const editable = screen.getByRole('textbox', { name: /explanation/i })
    await editable.click()
    await userEvent.keyboard('thêm ')
    await screen.getByRole('button', { name: /^lưu$/i }).click()
    expect(saved).toContain('thêm')
    expect(saved).toContain('"formula":true')
    expect(saved).toContain('"id":"blk2"')
    expect(saved).toContain('"borderShading"')
  })

  it('applies bold to the selection via the toolbar', async () => {
    let saved: string | null | undefined
    const screen = await render(
      <Harness
        initial={JSON.stringify([{ type: 'p', children: [{ text: 'abc' }] }])}
        onSave={(v) => (saved = v)}
      />
    )
    const editable = screen.getByRole('textbox', { name: /explanation/i })
    await editable.click()
    await userEvent.keyboard('{ControlOrMeta>}a{/ControlOrMeta}')
    await screen.getByRole('button', { name: /^bold$/i }).click()
    await screen.getByRole('button', { name: /^lưu$/i }).click()
    expect(saved).toContain('"bold":true')
  })

  it('applies a text color via the palette', async () => {
    let saved: string | null | undefined
    const screen = await render(
      <Harness
        initial={JSON.stringify([{ type: 'p', children: [{ text: 'abc' }] }])}
        onSave={(v) => (saved = v)}
      />
    )
    const editable = screen.getByRole('textbox', { name: /explanation/i })
    await editable.click()
    await userEvent.keyboard('{ControlOrMeta>}a{/ControlOrMeta}')
    await screen.getByRole('button', { name: /màu chữ/i }).click()
    await screen.getByRole('button', { name: /xanh dương/i }).click()
    await screen.getByRole('button', { name: /^lưu$/i }).click()
    expect(saved).toContain('"colorKey":"blue100"')
  })

  it('applies an annotation via the popover', async () => {
    let saved: string | null | undefined
    const screen = await render(
      <Harness
        initial={JSON.stringify([{ type: 'p', children: [{ text: 'abc' }] }])}
        onSave={(v) => (saved = v)}
      />
    )
    const editable = screen.getByRole('textbox', { name: /explanation/i })
    await editable.click()
    await userEvent.keyboard('{ControlOrMeta>}a{/ControlOrMeta}')
    await screen.getByRole('button', { name: /^annotation$/i }).click()
    await screen.getByRole('textbox', { name: /annotation text/i }).fill('S')
    await screen.getByRole('button', { name: /áp dụng/i }).click()
    await screen.getByRole('button', { name: /^lưu$/i }).click()
    expect(saved).toContain('"annotationText":"S"')
  })

  it('saving an emptied document yields null; cancel saves nothing', async () => {
    let saved: string | null | undefined = 'sentinel'
    const screen = await render(
      <Harness initial={null} onSave={(v) => (saved = v)} />
    )
    await screen.getByRole('button', { name: /^lưu$/i }).click()
    expect(saved).toBeNull()

    saved = 'sentinel'
    const screen2 = await render(
      <Harness initial={null} onSave={(v) => (saved = v)} />
    )
    await screen2.getByRole('button', { name: /huỷ/i }).click()
    expect(saved).toBe('sentinel')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test src/features/entry/components/detail/explanation-editor-dialog.test.tsx`
Expected: FAIL — cannot resolve `./explanation-editor-dialog`.

- [ ] **Step 3: Write the implementation**

```tsx
// src/features/entry/components/detail/explanation-editor-dialog.tsx
import { useMemo, useState } from 'react'
import { createEditor, Editor } from 'slate'
import { withHistory } from 'slate-history'
import {
  Editable,
  Slate,
  useSlate,
  withReact,
  type RenderElementProps,
  type RenderLeafProps,
} from 'slate-react'
import {
  Baseline,
  Bold,
  Highlighter,
  Italic,
  List,
  ListOrdered,
  Tag,
  Underline,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import {
  COLOR_KEYS,
  HIGHLIGHT_KEYS,
  colorCss,
  highlightCss,
  parseExplanation,
  serializeExplanation,
} from '../../data/explanation'
import {
  clearMark,
  currentBlockType,
  isBlockActive,
  isMarkActive,
  setBlockType,
  setMark,
  toggleList,
  toggleMark,
} from './explanation-commands'

export function ExplanationEditorDialog({
  open,
  onOpenChange,
  value,
  onSave,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  value: string | null | undefined
  onSave: (serialized: string | null) => void
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className='sm:max-w-3xl'>
        <DialogHeader>
          <DialogTitle>Sửa explanation</DialogTitle>
          <DialogDescription>
            Các định dạng đặc biệt không sửa được ở đây (formula, icon…) sẽ
            được giữ nguyên khi lưu.
          </DialogDescription>
        </DialogHeader>
        {open && (
          <EditorBody
            value={value}
            onCancel={() => onOpenChange(false)}
            onSave={(s) => {
              onSave(s)
              onOpenChange(false)
            }}
          />
        )}
      </DialogContent>
    </Dialog>
  )
}

function EditorBody({
  value,
  onSave,
  onCancel,
}: {
  value: string | null | undefined
  onSave: (serialized: string | null) => void
  onCancel: () => void
}) {
  const editor = useMemo(() => withHistory(withReact(createEditor())), [])
  const initialValue = useMemo(() => parseExplanation(value), [value])
  return (
    <Slate editor={editor} initialValue={initialValue}>
      <div className='flex flex-col gap-2'>
        <Toolbar />
        <Editable
          role='textbox'
          aria-label='Explanation editor'
          className='max-h-[55vh] min-h-48 overflow-auto rounded-md border p-3 text-sm focus:outline-none'
          renderElement={renderElement}
          renderLeaf={renderLeaf}
        />
        <DialogFooter>
          <Button type='button' variant='outline' onClick={onCancel}>
            Huỷ
          </Button>
          <Button
            type='button'
            onClick={() => onSave(serializeExplanation(editor.children))}
          >
            Lưu
          </Button>
        </DialogFooter>
      </div>
    </Slate>
  )
}

function renderElement({ attributes, children, element }: RenderElementProps) {
  switch (element.type) {
    case 'h1':
      return (
        <h1 {...attributes} className='text-xl font-bold'>
          {children}
        </h1>
      )
    case 'h2':
      return (
        <h2 {...attributes} className='text-lg font-bold'>
          {children}
        </h2>
      )
    case 'h3':
      return (
        <h3 {...attributes} className='text-base font-bold'>
          {children}
        </h3>
      )
    case 'ul':
      return (
        <ul {...attributes} className='list-disc ps-6'>
          {children}
        </ul>
      )
    case 'ol':
      return (
        <ol {...attributes} className='list-decimal ps-6'>
          {children}
        </ol>
      )
    case 'li':
      return <li {...attributes}>{children}</li>
    case 'p':
    case undefined:
      return <p {...attributes}>{children}</p>
    default:
      // Unknown block (borderShading…): generic container; type + extra
      // props survive serialization, text inside stays editable.
      return (
        <div {...attributes} className='rounded-md border border-dashed p-2'>
          {children}
        </div>
      )
  }
}

function renderLeaf({ attributes, children, leaf }: RenderLeafProps) {
  let content = children
  if (leaf.bold) content = <strong>{content}</strong>
  if (leaf.italic) content = <em>{content}</em>
  if (leaf.underline) content = <u>{content}</u>
  const annotation =
    typeof leaf.annotationText === 'string' && leaf.annotationText !== ''
      ? leaf.annotationText
      : null
  return (
    <span
      {...attributes}
      style={{
        color: colorCss(leaf.colorKey),
        backgroundColor: highlightCss(leaf.highlightKey),
      }}
    >
      {annotation && (
        <span
          contentEditable={false}
          className='bg-muted text-muted-foreground me-0.5 rounded px-1 align-super text-[10px] select-none'
        >
          {annotation}
        </span>
      )}
      {content}
    </span>
  )
}

function Toolbar() {
  const editor = useSlate()
  return (
    <div className='flex flex-wrap items-center gap-1 rounded-md border p-1'>
      <ToolbarButton
        label='Bold'
        active={isMarkActive(editor, 'bold')}
        onPress={() => toggleMark(editor, 'bold')}
      >
        <Bold className='size-4' />
      </ToolbarButton>
      <ToolbarButton
        label='Italic'
        active={isMarkActive(editor, 'italic')}
        onPress={() => toggleMark(editor, 'italic')}
      >
        <Italic className='size-4' />
      </ToolbarButton>
      <ToolbarButton
        label='Underline'
        active={isMarkActive(editor, 'underline')}
        onPress={() => toggleMark(editor, 'underline')}
      >
        <Underline className='size-4' />
      </ToolbarButton>
      <Separator orientation='vertical' className='h-6' />
      <BlockTypeSelect />
      <ToolbarButton
        label='Bullet list'
        active={isBlockActive(editor, 'ul')}
        onPress={() => toggleList(editor, 'ul')}
      >
        <List className='size-4' />
      </ToolbarButton>
      <ToolbarButton
        label='Numbered list'
        active={isBlockActive(editor, 'ol')}
        onPress={() => toggleList(editor, 'ol')}
      >
        <ListOrdered className='size-4' />
      </ToolbarButton>
      <Separator orientation='vertical' className='h-6' />
      <PaletteControl
        label='Màu chữ'
        markKey='colorKey'
        palette={COLOR_KEYS}
        icon={<Baseline className='size-4' />}
      />
      <PaletteControl
        label='Highlight'
        markKey='highlightKey'
        palette={HIGHLIGHT_KEYS}
        icon={<Highlighter className='size-4' />}
      />
      <AnnotationControl />
    </div>
  )
}

function ToolbarButton({
  label,
  active,
  onPress,
  children,
}: {
  label: string
  active?: boolean
  onPress: () => void
  children: React.ReactNode
}) {
  return (
    <Button
      type='button'
      variant={active ? 'secondary' : 'ghost'}
      size='icon'
      className='size-8'
      aria-label={label}
      aria-pressed={active}
      // mousedown + preventDefault keeps the editor selection intact
      onMouseDown={(e) => {
        e.preventDefault()
        onPress()
      }}
    >
      {children}
    </Button>
  )
}

function BlockTypeSelect() {
  const editor = useSlate()
  return (
    <Select
      value={currentBlockType(editor)}
      onValueChange={(v) => setBlockType(editor, v)}
    >
      <SelectTrigger
        className='h-8 w-32'
        size='sm'
        aria-label='Kiểu khối'
        onMouseDown={(e) => e.stopPropagation()}
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value='p'>Paragraph</SelectItem>
        <SelectItem value='h2'>Heading 2</SelectItem>
        <SelectItem value='h3'>Heading 3</SelectItem>
      </SelectContent>
    </Select>
  )
}

function PaletteControl({
  label,
  markKey,
  palette,
  icon,
}: {
  label: string
  markKey: 'colorKey' | 'highlightKey'
  palette: ReadonlyArray<{ key: string; css: string; label: string }>
  icon: React.ReactNode
}) {
  const editor = useSlate()
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          type='button'
          variant='ghost'
          size='icon'
          className='size-8'
          aria-label={label}
        >
          {icon}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className='flex w-auto items-center gap-1 p-2'
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        {palette.map((c) => (
          <Button
            key={c.key}
            type='button'
            variant='ghost'
            size='icon'
            className='size-7 rounded-full border'
            style={{ backgroundColor: c.css }}
            aria-label={c.label}
            onMouseDown={(e) => {
              e.preventDefault()
              setMark(editor, markKey, c.key)
            }}
          />
        ))}
        <Button
          type='button'
          variant='ghost'
          size='sm'
          onMouseDown={(e) => {
            e.preventDefault()
            clearMark(editor, markKey)
          }}
        >
          Bỏ
        </Button>
      </PopoverContent>
    </Popover>
  )
}

function AnnotationControl() {
  const editor = useSlate()
  const [open, setOpen] = useState(false)
  const [text, setText] = useState('')
  return (
    <Popover
      open={open}
      onOpenChange={(o) => {
        setOpen(o)
        if (o) {
          const marks = Editor.marks(editor) as Record<string, unknown> | null
          const current = marks?.annotationText
          setText(typeof current === 'string' ? current : '')
        }
      }}
    >
      <PopoverTrigger asChild>
        <Button
          type='button'
          variant='ghost'
          size='icon'
          className='size-8'
          aria-label='Annotation'
        >
          <Tag className='size-4' />
        </Button>
      </PopoverTrigger>
      <PopoverContent className='flex w-72 items-center gap-2 p-2'>
        <Input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder='S, V, N1…'
          aria-label='Annotation text'
        />
        <Button
          type='button'
          size='sm'
          onClick={() => {
            // editor.selection survives while focus is in this input
            if (text.trim()) setMark(editor, 'annotationText', text.trim())
            else clearMark(editor, 'annotationText')
            setOpen(false)
          }}
        >
          Áp dụng
        </Button>
      </PopoverContent>
    </Popover>
  )
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test src/features/entry/components/detail/explanation-editor-dialog.test.tsx`
Expected: PASS (6 tests).

Known flake points if something fails:
- `SelectTrigger` may not accept a `size` prop in this repo's shadcn version — check `src/components/ui/select.tsx` and drop the prop if absent.
- If clicking a palette swatch closes the popover before the mark applies, the `onMouseDown` + `preventDefault` is missing — clicks must NOT be plain `onClick` on swatches.
- If `userEvent.keyboard('{ControlOrMeta>}a{/ControlOrMeta}')` doesn't select all, use `'{Control>}a{/Control}'` (tests run on Linux Chromium).

- [ ] **Step 5: Commit**

```bash
git add src/features/entry/components/detail/explanation-editor-dialog.tsx src/features/entry/components/detail/explanation-editor-dialog.test.tsx
git commit -m "feat(entry): rich-text dialog editor for question explanations"
```

---

### Task 5: Wire the dialog into `QuestionCard`

**Files:**
- Modify: `src/features/entry/components/detail/question-group-editor.tsx` (the `QuestionCard` function, currently around lines 237–326)
- Test: `src/features/entry/components/detail/question-group-editor.test.tsx` (append one test)

- [ ] **Step 1: Write the failing test** (append to the existing `describe` block; also extend the imports)

Add to imports at the top of the test file:

```ts
import { userEvent } from '@vitest/browser/context'
```

Append inside `describe('question-group-editor', ...)`:

```tsx
  it('edits the explanation through the dialog and updates the preview', async () => {
    const groups = oneGroup()
    groups[0].questions[0] = {
      ...groups[0].questions[0],
      explanation: JSON.stringify([
        { type: 'p', children: [{ text: 'giải thích cũ', bold: true }] },
      ]),
    }
    const { getByRole, getByText } = await render(<Harness groups={groups} />)
    await getByRole('button', { name: /sửa explanation/i }).click()
    const editable = getByRole('textbox', { name: /explanation editor/i })
    await editable.click()
    await userEvent.keyboard(' thêm')
    await getByRole('button', { name: /^lưu$/i }).click()
    // dialog closed, preview (plateToText) shows the new text
    await expect.element(getByText(/thêm/)).toBeInTheDocument()
  })
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test src/features/entry/components/detail/question-group-editor.test.tsx`
Expected: the new test FAILS (no button named "Sửa explanation"); the existing 3 tests still pass.

- [ ] **Step 3: Modify `QuestionCard`**

In `question-group-editor.tsx`:

a. Add the import (with the other `./` imports):

```ts
import { ExplanationEditorDialog } from './explanation-editor-dialog'
```

b. Inside `QuestionCard`, add state next to the existing hooks:

```ts
const [editingExplanation, setEditingExplanation] = useState(false)
```

c. Replace the explanation display block (currently):

```tsx
        <div className='flex flex-col gap-1'>
          <Label className='text-muted-foreground'>Explanation</Label>
          <div className='max-h-32 overflow-auto rounded-md border bg-muted/40 p-2 text-sm whitespace-pre-line'>
            {explanation || (
              <span className='text-muted-foreground italic'>—</span>
            )}
          </div>
          <span className='text-xs text-muted-foreground italic'>
            Chỉnh sửa explanation ở phase sau
          </span>
        </div>
```

with:

```tsx
        <div className='flex flex-col gap-1'>
          <div className='flex items-center justify-between'>
            <Label className='text-muted-foreground'>Explanation</Label>
            {!disabled && (
              <Button
                type='button'
                variant='outline'
                size='sm'
                aria-label='Sửa explanation'
                onClick={() => setEditingExplanation(true)}
              >
                Sửa
              </Button>
            )}
          </div>
          <div className='max-h-32 overflow-auto rounded-md border bg-muted/40 p-2 text-sm whitespace-pre-line'>
            {explanation || (
              <span className='text-muted-foreground italic'>—</span>
            )}
          </div>
          {editingExplanation && (
            <ExplanationEditorDialog
              open={editingExplanation}
              onOpenChange={setEditingExplanation}
              value={(question?.explanation as string | null) ?? null}
              onSave={(s) =>
                form.setValue(path(`${base}.explanation`), s as never, {
                  shouldDirty: true,
                })
              }
            />
          )}
        </div>
```

(The `explanation` const and `plateToText` import stay — the read-only preview is unchanged.)

- [ ] **Step 4: Run the test file to verify all pass**

Run: `pnpm test src/features/entry/components/detail/question-group-editor.test.tsx`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/features/entry/components/detail/question-group-editor.tsx src/features/entry/components/detail/question-group-editor.test.tsx
git commit -m "feat(entry): edit question explanation from the question card"
```

---

### Task 6: Full verification gate

**Files:** none new — formatting may touch the files above.

- [ ] **Step 1: Format (import order is auto-sorted)**

```bash
pnpm format
```

- [ ] **Step 2: Lint + typecheck/build + dead-code scan**

```bash
pnpm lint && pnpm build && pnpm knip
```

Expected: all exit 0. If knip flags `slate-dom` (only when it was added in Task 1), add it to `ignoreDependencies` in `knip.config.ts` with a comment that it is slate-react's required peer.

- [ ] **Step 3: Full test suite**

```bash
pnpm test
```

Expected: all pass EXCEPT the pre-existing `search-provider` failure on develop (known issue — do not fix here, just confirm it is the same failure).

- [ ] **Step 4: Commit any formatting fallout**

```bash
git add -A src docs knip.config.ts
git commit -m "style: format explanation editor changes" || echo "nothing to format"
```
