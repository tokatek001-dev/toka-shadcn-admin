import { useMemo, useState } from 'react'
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
import { createEditor, Editor, Transforms } from 'slate'
import { withHistory } from 'slate-history'
import {
  Editable,
  ReactEditor,
  Slate,
  useSlate,
  withReact,
  type RenderElementProps,
  type RenderLeafProps,
} from 'slate-react'
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

/**
 * Slate's selectionchange handler is throttled at 100ms. After Ctrl+A or any
 * rapid DOM selection change, editor.selection may not yet reflect the current
 * DOM selection. This helper syncs the DOM selection into editor.selection so
 * mark commands work correctly even when called immediately after Ctrl+A.
 */
function syncDomSelection(editor: Editor) {
  try {
    const root = ReactEditor.findDocumentOrShadowRoot(editor) as Document
    const domSelection = root.getSelection()
    if (!domSelection || domSelection.rangeCount === 0) return
    const range = ReactEditor.toSlateRange(editor, domSelection, {
      exactMatch: false,
      suppressThrow: true,
    })
    if (range) Transforms.select(editor, range)
  } catch {
    // selection is outside the editor — leave editor.selection as-is
  }
}

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
      <DialogContent
        className='sm:max-w-3xl'
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>Sửa explanation</DialogTitle>
          <DialogDescription>
            Các định dạng đặc biệt không sửa được ở đây (formula, icon…) sẽ được
            giữ nguyên khi lưu.
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
          className='me-0.5 rounded bg-muted px-1 align-super text-[10px] text-muted-foreground select-none'
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
        editor={editor}
      >
        <Bold className='size-4' />
      </ToolbarButton>
      <ToolbarButton
        label='Italic'
        active={isMarkActive(editor, 'italic')}
        onPress={() => toggleMark(editor, 'italic')}
        editor={editor}
      >
        <Italic className='size-4' />
      </ToolbarButton>
      <ToolbarButton
        label='Underline'
        active={isMarkActive(editor, 'underline')}
        onPress={() => toggleMark(editor, 'underline')}
        editor={editor}
      >
        <Underline className='size-4' />
      </ToolbarButton>
      <Separator orientation='vertical' className='h-6' />
      <BlockTypeSelect />
      <ToolbarButton
        label='Bullet list'
        active={isBlockActive(editor, 'ul')}
        onPress={() => toggleList(editor, 'ul')}
        editor={editor}
      >
        <List className='size-4' />
      </ToolbarButton>
      <ToolbarButton
        label='Numbered list'
        active={isBlockActive(editor, 'ol')}
        onPress={() => toggleList(editor, 'ol')}
        editor={editor}
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
  editor,
}: {
  label: string
  active?: boolean
  onPress: () => void
  children: React.ReactNode
  editor: Editor
}) {
  return (
    <Button
      type='button'
      variant={active ? 'secondary' : 'ghost'}
      size='icon'
      className='size-8'
      aria-label={label}
      aria-pressed={active}
      // mousedown + preventDefault keeps the editor selection intact;
      // syncDomSelection ensures the selection is up-to-date even when
      // Slate's throttled selectionchange handler hasn't fired yet.
      onMouseDown={(e) => {
        e.preventDefault()
        syncDomSelection(editor)
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
      onValueChange={(v) => setBlockType(editor, v as 'p' | 'h2' | 'h3')}
    >
      <SelectTrigger className='h-8 w-32' aria-label='Kiểu khối'>
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
              syncDomSelection(editor)
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
            syncDomSelection(editor)
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
  // Capture the Slate selection when the popover opens so we can restore it
  // when "Áp dụng" is clicked (focus will have moved to the input by then,
  // and the 100ms-throttled selectionchange handler may have cleared
  // editor.selection).
  const [savedSelection, setSavedSelection] =
    useState<typeof editor.selection>(null)
  return (
    <Popover
      open={open}
      onOpenChange={(o) => {
        setOpen(o)
        if (o) {
          // Sync DOM → Slate selection before reading marks
          syncDomSelection(editor)
          setSavedSelection(editor.selection)
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
      <PopoverContent
        className='flex w-72 items-center gap-2 p-2'
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
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
            // Restore the selection that was captured when the popover opened,
            // in case it was cleared while the input had focus.
            if (savedSelection) Transforms.select(editor, savedSelection)
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
