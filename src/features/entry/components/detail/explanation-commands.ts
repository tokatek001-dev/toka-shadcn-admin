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

export function setBlockType(editor: Editor, type: 'p' | 'h1' | 'h2' | 'h3') {
  const { selection } = editor
  const at = selection ? Editor.unhangRange(editor, selection) : undefined
  Transforms.setNodes(editor, { type }, { at, match: isType(TEXT_BLOCK_TYPES) })
}

export function toggleList(editor: Editor, type: 'ul' | 'ol') {
  const { selection } = editor
  // Use the raw selection for unwraps so that a multi-item selection whose
  // focus lands at offset-0 of the next block is not silently trimmed by
  // unhangRange before the list nodes are processed.
  const rawAt = selection ?? undefined
  const active = isBlockActive(editor, type)

  // Lift out of any current list (li first, then the ul/ol wrapper).
  Transforms.unwrapNodes(editor, { at: rawAt, match: isType(['li']), split: true })
  Transforms.unwrapNodes(editor, { at: rawAt, match: isType(LIST_TYPES), split: true })
  if (active) return

  // Gather matched text blocks after the unwraps using the raw (post-mutation)
  // selection — do NOT use unhangRange here, so that blocks in different
  // containers are all visible and the parent guard can fire correctly.
  const blocks = Array.from(
    Editor.nodes(editor, { at: editor.selection ?? undefined, match: isType(TEXT_BLOCK_TYPES) })
  )
  // Guard: all gathered blocks must share the same immediate parent.
  // Checked AFTER unwraps so that a coming-from-list selection (items in
  // different li parents) sees the blocks as top-level siblings and passes.
  // A cross-container selection with no lists involved will have had no-op
  // unwraps and the blocks will still have different parents — bail without
  // further mutation.
  // (Known edge: selection spanning BOTH a list and a borderShading > p will
  // un-list then bail — document is changed but never corrupted.)
  if (blocks.length > 0) {
    const parentKey = (path: number[]) => JSON.stringify(path.slice(0, -1))
    const firstParent = parentKey(blocks[0][1])
    if (blocks.some(([, path]) => parentKey(path) !== firstParent)) return
  }
  // Wrap each selected text block in its own li (reverse order keeps the
  // earlier paths stable). Capture the original paths before any wrapping.
  const originalPaths = blocks.map(([, p]) => p)
  for (const path of [...originalPaths].reverse()) {
    Transforms.wrapNodes(editor, { type: 'li', children: [] }, { at: path })
  }
  // Wrap all the resulting li nodes under one list element. Build a range
  // spanning from the first to the last li path explicitly — this avoids
  // unhangRange silently trimming a multi-block selection whose focus starts
  // at offset-0 of the second block.
  const firstPath = originalPaths[0]
  const lastPath = originalPaths[originalPaths.length - 1]
  const wrapAt =
    firstPath && lastPath
      ? {
          anchor: { path: [...firstPath, 0], offset: 0 },
          focus: { path: [...lastPath, 0], offset: 0 },
        }
      : (editor.selection ?? undefined)
  Transforms.wrapNodes(editor, { type, children: [] }, { at: wrapAt, match: isType(['li']) })
}
