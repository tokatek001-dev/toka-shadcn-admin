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
  // earlier paths stable).
  const blocks = Array.from(
    Editor.nodes(editor, { match: isType(TEXT_BLOCK_TYPES) })
  )
  for (const [, path] of blocks.reverse()) {
    Transforms.wrapNodes(editor, { type: 'li', children: [] }, { at: path })
  }
  // Wrap all the resulting li nodes under one list element.
  Transforms.wrapNodes(editor, { type, children: [] }, { match: isType(['li']) })
}
