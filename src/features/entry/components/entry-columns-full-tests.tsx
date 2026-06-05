import { type ColumnDef } from '@tanstack/react-table'
import { DataTableColumnHeader } from '@/components/data-table'
import { LongText } from '@/components/long-text'
import { formatDuration, formatUpdatedAt } from '../data/format'
import { type FullTest } from '../data/schema'

export const entryColumnsFullTests: ColumnDef<FullTest>[] = [
  {
    accessorKey: 'name',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title='Name' />
    ),
    cell: ({ row }) => (
      <LongText className='max-w-56 ps-1'>
        {row.getValue('name') ?? '–'}
      </LongText>
    ),
    enableSorting: false,
    enableHiding: false,
  },
  {
    accessorKey: 'test_type',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title='Test Type' />
    ),
    cell: ({ row }) => (
      <div className='text-nowrap'>{row.getValue('test_type') ?? '–'}</div>
    ),
    enableSorting: false,
  },
  {
    accessorKey: 'parent_test_type',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title='Parent Type' />
    ),
    cell: ({ row }) => {
      const value = row.getValue<string | null>('parent_test_type')
      return (
        <div className='text-nowrap'>
          {value ? value.replace('_', ' ') : '–'}
        </div>
      )
    },
    enableSorting: false,
  },
  {
    accessorKey: 'level',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title='Level' />
    ),
    cell: ({ row }) => {
      const level = row.getValue<string | null>('level')
      return (
        <div className='text-nowrap'>
          {level ? level.replace('_', ' ') : '–'}
        </div>
      )
    },
    enableSorting: false,
  },
  {
    accessorKey: 'total_question',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title='Questions' />
    ),
    cell: ({ row }) => <div>{row.getValue('total_question') ?? '–'}</div>,
    enableSorting: false,
  },
  {
    accessorKey: 'duration_in_second',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title='Duration' />
    ),
    cell: ({ row }) => (
      <div className='text-nowrap tabular-nums'>
        {formatDuration(row.getValue('duration_in_second'))}
      </div>
    ),
    enableSorting: false,
  },
  {
    accessorKey: 'document_status',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title='Status' />
    ),
    cell: ({ row }) => (
      <div className='text-nowrap'>
        {row.getValue('document_status') ?? '–'}
      </div>
    ),
    enableSorting: false,
  },
  {
    accessorKey: 'content_access_type',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title='Access' />
    ),
    cell: ({ row }) => (
      <div className='text-nowrap'>
        {row.getValue('content_access_type') ?? '–'}
      </div>
    ),
    enableSorting: false,
  },
  {
    accessorKey: 'updated_at',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title='Updated' />
    ),
    cell: ({ row }) => (
      <div className='text-nowrap'>
        {formatUpdatedAt(row.getValue('updated_at'))}
      </div>
    ),
    enableSorting: false,
  },
]
