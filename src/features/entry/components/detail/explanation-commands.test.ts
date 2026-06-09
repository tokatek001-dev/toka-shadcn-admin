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
