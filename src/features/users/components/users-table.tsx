import { useEffect, useMemo, useState } from 'react'
import {
  type ColumnFiltersState,
  type VisibilityState,
  flexRender,
  getCoreRowModel,
  useReactTable,
} from '@tanstack/react-table'
import { AlertCircle } from 'lucide-react'
import { cn } from '@/lib/utils'
import { type NavigateFn, useTableUrlState } from '@/hooks/use-table-url-state'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  DataTablePagination,
  DataTableToolbar,
  TableSkeleton,
} from '@/components/data-table'
import { roles } from '../data/data'
import { type UserRole } from '../data/schema'
import { useUsersData, type UsersFilters } from '../hooks/use-users-data'
import { DataTableBulkActions } from './data-table-bulk-actions'
import { usersColumns as columns } from './users-columns'

type UsersTableProps = {
  search: Record<string, unknown>
  navigate: NavigateFn
}

function getArray(filters: ColumnFiltersState, id: string): string[] {
  const found = filters.find((f) => f.id === id)
  return Array.isArray(found?.value) ? (found.value as string[]) : []
}

function getString(filters: ColumnFiltersState, id: string): string {
  const found = filters.find((f) => f.id === id)
  return typeof found?.value === 'string' ? (found.value as string) : ''
}

export function UsersTable({ search, navigate }: UsersTableProps) {
  const [rowSelection, setRowSelection] = useState({})
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({})

  // Synced with URL states (keys/defaults mirror users route search schema)
  const {
    columnFilters,
    onColumnFiltersChange,
    pagination,
    onPaginationChange,
    ensurePageInRange,
  } = useTableUrlState({
    search,
    navigate,
    pagination: { defaultPage: 1, defaultPageSize: 10 },
    globalFilter: { enabled: false },
    columnFilters: [
      { columnId: 'displayName', searchKey: 'search', type: 'string' },
      { columnId: 'role', searchKey: 'role', type: 'array' },
    ],
  })

  const filters: UsersFilters = useMemo(
    () => ({
      search: getString(columnFilters, 'displayName'),
      role: getArray(columnFilters, 'role') as UserRole[],
    }),
    [columnFilters]
  )

  const { data, count, isLoading, error, refetch } = useUsersData({
    pageIndex: pagination.pageIndex,
    pageSize: pagination.pageSize,
    filters,
  })

  const pageCount = Math.max(1, Math.ceil(count / pagination.pageSize))

  // eslint-disable-next-line react-hooks/incompatible-library
  const table = useReactTable({
    data,
    columns,
    state: {
      pagination,
      rowSelection,
      columnFilters,
      columnVisibility,
    },
    enableRowSelection: true,
    // Stable row ids: selection must track user ids, not page-relative
    // indexes, or paging would silently retarget bulk actions.
    getRowId: (row) => row.id,
    manualPagination: true,
    manualFiltering: true,
    pageCount,
    onPaginationChange,
    onColumnFiltersChange,
    onRowSelectionChange: setRowSelection,
    onColumnVisibilityChange: setColumnVisibility,
    getCoreRowModel: getCoreRowModel(),
  })

  useEffect(() => {
    // Skip while the first load is in flight: count is still 0 then, and
    // clamping against that would bounce a bookmarked ?page=N back to 1.
    if (!isLoading) {
      ensurePageInRange(pageCount)
    }
  }, [isLoading, pageCount, ensurePageInRange])

  return (
    <div
      className={cn(
        'max-sm:has-[div[role="toolbar"]]:mb-16', // Add margin bottom to the table on mobile when the toolbar is visible
        'flex flex-1 flex-col gap-4'
      )}
    >
      <DataTableToolbar
        table={table}
        searchPlaceholder='Search by name or email...'
        searchKey='displayName'
        filters={[
          {
            columnId: 'role',
            title: 'Role',
            options: roles.map((role) => ({ ...role })),
          },
        ]}
      />

      {error ? (
        <Alert variant='destructive'>
          <AlertCircle />
          <AlertTitle>Failed to load users</AlertTitle>
          <AlertDescription>
            {error instanceof Error ? error.message : 'Unknown error'}
            <Button
              variant='outline'
              size='sm'
              className='mt-2'
              onClick={() => refetch()}
            >
              Retry
            </Button>
          </AlertDescription>
        </Alert>
      ) : (
        <div className='overflow-hidden rounded-md border'>
          {isLoading ? (
            <TableSkeleton columnCount={columns.length} />
          ) : (
            <Table>
              <TableHeader>
                {table.getHeaderGroups().map((headerGroup) => (
                  <TableRow key={headerGroup.id} className='group/row'>
                    {headerGroup.headers.map((header) => (
                      <TableHead
                        key={header.id}
                        colSpan={header.colSpan}
                        className={cn(
                          'bg-background group-hover/row:bg-muted group-data-[state=selected]/row:bg-muted',
                          header.column.columnDef.meta?.className,
                          header.column.columnDef.meta?.thClassName
                        )}
                      >
                        {header.isPlaceholder
                          ? null
                          : flexRender(
                              header.column.columnDef.header,
                              header.getContext()
                            )}
                      </TableHead>
                    ))}
                  </TableRow>
                ))}
              </TableHeader>
              <TableBody>
                {table.getRowModel().rows?.length ? (
                  table.getRowModel().rows.map((row) => (
                    <TableRow
                      key={row.id}
                      data-state={row.getIsSelected() && 'selected'}
                      className='group/row'
                    >
                      {row.getVisibleCells().map((cell) => (
                        <TableCell
                          key={cell.id}
                          className={cn(
                            'bg-background group-hover/row:bg-muted group-data-[state=selected]/row:bg-muted',
                            cell.column.columnDef.meta?.className,
                            cell.column.columnDef.meta?.tdClassName
                          )}
                        >
                          {flexRender(
                            cell.column.columnDef.cell,
                            cell.getContext()
                          )}
                        </TableCell>
                      ))}
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell
                      colSpan={columns.length}
                      className='h-24 text-center'
                    >
                      No results.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          )}
        </div>
      )}

      {!error && <DataTablePagination table={table} className='mt-auto' />}
      <DataTableBulkActions table={table} />
    </div>
  )
}
