// src/features/entry/components/detail/explanation-editor-dialog.test.tsx
import { useState } from 'react'
import { userEvent } from '@vitest/browser/context'
import { describe, expect, it } from 'vitest'
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
    await expect.element(screen.getByText('trong khung')).toBeInTheDocument()
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
