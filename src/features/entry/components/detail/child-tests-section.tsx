import { useMemo, useState } from 'react'
import { Clock, Eye, ListChecks, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  type ChildSlot,
  childSlotTable,
  childSlots,
  orderedIdsFromSlots,
  slotKeyForChild,
} from '../../data/child-test-slots'
import { formatDuration } from '../../data/format'
import {
  useTestsByIds,
  type ChildTestCandidate,
} from '../../hooks/use-child-test-candidates'
import { ChildTestPickerDialog } from './child-test-picker-dialog'

const humanize = (v: string | null | undefined) =>
  v ? v.charAt(0) + v.slice(1).toLowerCase() : ''

const detailHref = (slot: ChildSlot, id: string) =>
  slot.table === 'data_entry_part_test'
    ? `/entry/part-tests/${id}`
    : `/entry/full-tests/${id}`

type ChildTestsSectionProps = {
  testType: string | null
  /** The full test's own id (excluded from FT candidate lists). */
  excludeId: string
  childIds: string[]
  disabled: boolean
  onChange: (ids: string[]) => void
}

export function ChildTestsSection({
  testType,
  excludeId,
  childIds,
  disabled,
  onChange,
}: ChildTestsSectionProps) {
  const slots = useMemo(() => childSlots(testType), [testType])
  const table = childSlotTable(slots)
  const resolved = useTestsByIds(table, childIds)
  const [openSlot, setOpenSlot] = useState<ChildSlot | null>(null)

  // slotKey -> child id, derived from the resolved children's part/test_type.
  const byKey = useMemo(() => {
    const map: Record<string, string> = {}
    for (const child of resolved.data) {
      const key = slotKeyForChild(slots, child)
      if (key) map[key] = child.id
    }
    return map
  }, [resolved.data, slots])

  const childForSlot = (slot: ChildSlot): ChildTestCandidate | undefined => {
    const id = byKey[slot.key]
    return id ? resolved.data.find((t) => t.id === id) : undefined
  }

  const confirmSlot = (id: string | null) => {
    if (!openSlot) return
    const next = { ...byKey }
    if (id) next[openSlot.key] = id
    else delete next[openSlot.key]
    onChange(orderedIdsFromSlots(slots, next))
  }

  const filledCount = slots.filter((s) => byKey[s.key]).length
  const editLocked = disabled || resolved.isLoading

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          Child tests
          {slots.length > 0 && ` (${filledCount}/${slots.length})`}
        </CardTitle>
      </CardHeader>
      <CardContent className='flex flex-col gap-4'>
        {slots.length === 0 ? (
          <p className='text-sm text-muted-foreground'>
            Loại test này không hỗ trợ chọn bài con.
          </p>
        ) : (
          slots.map((slot) => (
            <SlotCard
              key={slot.key}
              slot={slot}
              child={childForSlot(slot)}
              disabled={editLocked}
              onPick={() => setOpenSlot(slot)}
            />
          ))
        )}
      </CardContent>

      <ChildTestPickerDialog
        open={openSlot != null}
        onOpenChange={(o) => !o && setOpenSlot(null)}
        slot={openSlot}
        excludeId={excludeId}
        value={openSlot ? byKey[openSlot.key] : undefined}
        onConfirm={confirmSlot}
      />
    </Card>
  )
}

function SlotCard({
  slot,
  child,
  disabled,
  onPick,
}: {
  slot: ChildSlot
  child: ChildTestCandidate | undefined
  disabled: boolean
  onPick: () => void
}) {
  const subtitle = [child?.base_id, humanize(child?.level)]
    .filter(Boolean)
    .join(' · ')

  return (
    <div className='rounded-lg border bg-muted/30 p-4'>
      <div className='mb-3 text-sm font-semibold'>{slot.label}</div>
      {child ? (
        <>
          <div className='flex items-center justify-between gap-3 rounded-md border border-s-4 border-s-primary bg-background px-3 py-2'>
            <div className='min-w-0'>
              <div className='truncate font-medium'>
                {child.name ?? '(không tên)'}
              </div>
              {subtitle && (
                <div className='truncate text-xs text-muted-foreground'>
                  {subtitle}
                </div>
              )}
            </div>
            <div className='flex shrink-0 gap-1'>
              <Button
                type='button'
                size='icon'
                variant='outline'
                aria-label='Đổi bài'
                disabled={disabled}
                onClick={onPick}
              >
                <RefreshCw className='size-4' />
              </Button>
              <Button
                type='button'
                size='icon'
                variant='ghost'
                aria-label='Xem trước'
                asChild
              >
                <a
                  href={detailHref(slot, child.id)}
                  target='_blank'
                  rel='noopener noreferrer'
                >
                  <Eye className='size-4' />
                </a>
              </Button>
            </div>
          </div>
          <div className='mt-3 grid grid-cols-2 gap-4 text-sm'>
            <div>
              <div className='text-muted-foreground'>Time</div>
              <div className='flex items-center gap-1.5 font-medium'>
                <Clock className='size-4 text-muted-foreground' />
                {formatDuration(child.duration_in_second)}
              </div>
            </div>
            <div>
              <div className='text-muted-foreground'>Questions number</div>
              <div className='flex items-center gap-1.5 font-medium'>
                <ListChecks className='size-4 text-muted-foreground' />
                {child.total_question ?? '—'}
              </div>
            </div>
          </div>
        </>
      ) : (
        <Button
          type='button'
          variant='outline'
          size='sm'
          disabled={disabled}
          onClick={onPick}
        >
          Chọn bài
        </Button>
      )}
    </div>
  )
}
