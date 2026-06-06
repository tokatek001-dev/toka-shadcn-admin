import { type ColumnDef } from '@tanstack/react-table'
import { cn } from '@/lib/utils'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { DataTableColumnHeader } from '@/components/data-table'
import { LongText } from '@/components/long-text'
import { feedbackStatusColors, feedbackStatuses } from '../data/data'
import { type Feedback } from '../data/schema'
import { FeedbackStatusAction } from './feedback-status-action'

export const feedbackColumns: ColumnDef<Feedback>[] = [
  {
    id: 'submitter',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title='User' />
    ),
    cell: ({ row }) => {
      const { submitterName, submitterAvatarUrl } = row.original
      return (
        <div className='flex items-center gap-x-2 ps-1'>
          <Avatar className='size-7'>
            {submitterAvatarUrl ? (
              <AvatarImage src={submitterAvatarUrl} alt={submitterName} />
            ) : null}
            <AvatarFallback>
              {submitterName.charAt(0).toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <LongText className='max-w-36'>{submitterName}</LongText>
        </div>
      )
    },
    meta: { className: 'w-44' },
    enableSorting: false,
    enableHiding: false,
  },
  {
    accessorKey: 'content',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title='Feedback' />
    ),
    cell: ({ row }) => (
      <LongText className='max-w-md'>{row.getValue('content')}</LongText>
    ),
    enableSorting: false,
    enableHiding: false,
  },
  {
    accessorKey: 'status',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title='Status' />
    ),
    cell: ({ row }) => {
      const { status } = row.original
      const statusDef = feedbackStatuses.find((s) => s.value === status)
      return (
        <div className='flex items-center gap-x-2'>
          {statusDef?.icon && (
            <statusDef.icon size={16} className='text-muted-foreground' />
          )}
          <Badge
            variant='outline'
            className={cn(feedbackStatusColors.get(status))}
          >
            {statusDef?.label ?? status}
          </Badge>
        </div>
      )
    },
    enableSorting: false,
    enableHiding: false,
  },
  {
    accessorKey: 'createdAt',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title='Submitted' />
    ),
    cell: ({ row }) => (
      <div className='text-nowrap'>
        {row.original.createdAt.toLocaleDateString()}
      </div>
    ),
    enableSorting: false,
  },
  {
    id: 'actions',
    cell: FeedbackStatusAction,
  },
]
