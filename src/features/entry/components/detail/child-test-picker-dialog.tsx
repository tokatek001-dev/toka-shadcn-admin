import { useMemo, useState } from 'react'
import { Link } from '@tanstack/react-router'
import { Check, Eye, Plus, Search } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { type ChildSlot } from '../../data/child-test-slots'
import { formatDuration } from '../../data/format'
import {
  useSlotCandidates,
  type ChildTestCandidate,
} from '../../hooks/use-child-test-candidates'

type ChildTestPickerDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  slot: ChildSlot | null
  /** Full test's own id — excluded from FT (full-of-full) candidate lists. */
  excludeId: string
  /** Currently chosen child id for this slot (single-select). */
  value: string | undefined
  onConfirm: (id: string | null) => void
}

const humanize = (v: string | null | undefined) =>
  v ? v.charAt(0) + v.slice(1).toLowerCase() : ''

export function ChildTestPickerDialog({
  open,
  onOpenChange,
  slot,
  excludeId,
  value,
  onConfirm,
}: ChildTestPickerDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className='flex max-h-[85vh] flex-col gap-4 sm:max-w-3xl'>
        {open && slot && (
          // Remounts each open so selection re-seeds from `value` cleanly.
          <PickerBody
            slot={slot}
            excludeId={excludeId}
            initial={value}
            onCancel={() => onOpenChange(false)}
            onConfirm={(id) => {
              onConfirm(id)
              onOpenChange(false)
            }}
          />
        )}
      </DialogContent>
    </Dialog>
  )
}

function PickerBody({
  slot,
  excludeId,
  initial,
  onCancel,
  onConfirm,
}: {
  slot: ChildSlot
  excludeId: string
  initial: string | undefined
  onCancel: () => void
  onConfirm: (id: string | null) => void
}) {
  const [selected, setSelected] = useState<string | undefined>(initial)
  const [search, setSearch] = useState('')
  const [tab, setTab] = useState<'all' | 'selected'>('all')

  const candidates = useSlotCandidates({ slot, excludeId, search })

  const rows = useMemo(() => {
    if (tab === 'selected') {
      return candidates.data.filter((c) => c.id === selected)
    }
    return candidates.data
  }, [candidates.data, tab, selected])

  return (
    <>
      <DialogHeader>
        <DialogTitle>Chọn bài — {slot.label}</DialogTitle>
        <DialogDescription className='sr-only'>
          Chọn một bài cho {slot.label}. Chỉ hiển thị các bài PUBLISHED.
        </DialogDescription>
      </DialogHeader>

      <div className='flex items-center gap-3'>
        <div className='relative flex-1'>
          <Search className='pointer-events-none absolute inset-s-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground' />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder='Tìm theo tên / ID'
            className='ps-9'
          />
        </div>
        <div className='flex gap-2'>
          <Button
            type='button'
            size='sm'
            variant={tab === 'all' ? 'default' : 'outline'}
            onClick={() => setTab('all')}
          >
            All
          </Button>
          <Button
            type='button'
            size='sm'
            variant={tab === 'selected' ? 'default' : 'outline'}
            onClick={() => setTab('selected')}
          >
            Selected
            <Badge variant='secondary' className='ms-2'>
              {selected ? 1 : 0}
            </Badge>
          </Button>
        </div>
      </div>

      <ScrollArea className='h-[55vh] rounded-md border'>
        <Table>
          <TableHeader className='sticky top-0 z-10 bg-muted'>
            <TableRow>
              <TableHead>Test name</TableHead>
              <TableHead>Type</TableHead>
              <TableHead className='w-24' />
            </TableRow>
          </TableHeader>
          <TableBody>
            {candidates.isLoading ? (
              <StateRow text='Đang tải…' />
            ) : candidates.error ? (
              <StateRow
                text={
                  candidates.error instanceof Error
                    ? candidates.error.message
                    : 'Lỗi tải dữ liệu'
                }
                destructive
              />
            ) : rows.length === 0 ? (
              <StateRow
                text={
                  tab === 'selected' ? 'Chưa chọn bài nào.' : 'Không có bài nào.'
                }
              />
            ) : (
              rows.map((item) => (
                <CandidateRow
                  key={item.id}
                  item={item}
                  slot={slot}
                  isSelected={item.id === selected}
                  onPick={() =>
                    setSelected((prev) => (prev === item.id ? undefined : item.id))
                  }
                />
              ))
            )}
          </TableBody>
        </Table>
      </ScrollArea>

      <div className='flex justify-end gap-2'>
        <Button type='button' variant='outline' onClick={onCancel}>
          Cancel
        </Button>
        <Button type='button' onClick={() => onConfirm(selected ?? null)}>
          OK
        </Button>
      </div>
    </>
  )
}

function CandidateRow({
  item,
  slot,
  isSelected,
  onPick,
}: {
  item: ChildTestCandidate
  slot: ChildSlot
  isSelected: boolean
  onPick: () => void
}) {
  const subtitle = [item.base_id, humanize(item.level)].filter(Boolean).join(' · ')
  const typeMeta = [
    item.total_question != null && `${item.total_question} câu`,
    item.duration_in_second != null && formatDuration(item.duration_in_second),
  ]
    .filter(Boolean)
    .join(' · ')

  return (
    <TableRow data-state={isSelected ? 'selected' : undefined}>
      <TableCell>
        <div className='font-medium'>{item.name ?? '(không tên)'}</div>
        {subtitle && (
          <div className='text-xs text-muted-foreground'>{subtitle}</div>
        )}
      </TableCell>
      <TableCell>
        <div>{humanize(item.flag_type) || item.test_type || '—'}</div>
        {typeMeta && (
          <div className='text-xs text-muted-foreground'>{typeMeta}</div>
        )}
      </TableCell>
      <TableCell>
        <div className='flex justify-end gap-1'>
          <Button
            type='button'
            size='icon'
            variant={isSelected ? 'default' : 'outline'}
            aria-label={isSelected ? 'Bỏ chọn' : 'Chọn'}
            aria-pressed={isSelected}
            onClick={onPick}
          >
            {isSelected ? (
              <Check className='size-4' />
            ) : (
              <Plus className='size-4' />
            )}
          </Button>
          <Button
            type='button'
            size='icon'
            variant='ghost'
            aria-label='Xem trước'
            asChild
          >
            {slot.table === 'data_entry_part_test' ? (
              <Link to='/entry/part-tests/$id' params={{ id: item.id }}>
                <Eye className='size-4' />
              </Link>
            ) : (
              <Link to='/entry/full-tests/$id' params={{ id: item.id }}>
                <Eye className='size-4' />
              </Link>
            )}
          </Button>
        </div>
      </TableCell>
    </TableRow>
  )
}

function StateRow({
  text,
  destructive,
}: {
  text: string
  destructive?: boolean
}) {
  return (
    <TableRow>
      <TableCell
        colSpan={3}
        className={cn(
          'py-8 text-center text-sm text-muted-foreground',
          destructive && 'text-destructive'
        )}
      >
        {text}
      </TableCell>
    </TableRow>
  )
}
