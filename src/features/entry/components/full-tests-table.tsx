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
import { DataTablePagination, DataTableToolbar } from '@/components/data-table'
import {
  fullDocumentStatusOptions,
  fullTestTypeOptions,
  parentTestTypeOptions,
  sortableEntryColumns,
} from '../data/schema'
import {
  useFullTestsData,
  type FullTestsFilters,
} from '../hooks/use-full-tests-data'
import { entryColumnsFullTests as columns } from './entry-columns-full-tests'
import { EntryEmptyState } from './entry-empty-state'
import { EntryTableSkeleton } from './entry-table-skeleton'

type FullTestsTableProps = {
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

export function FullTestsTable({ search, navigate }: FullTestsTableProps) {
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({})

  const {
    columnFilters,
    onColumnFiltersChange,
    pagination,
    onPaginationChange,
    sorting,
    onSortingChange,
    ensurePageInRange,
  } = useTableUrlState({
    search,
    navigate,
    pagination: { defaultPage: 1, defaultPageSize: 20 },
    globalFilter: { enabled: false },
    sorting: {
      defaultColumn: 'updated_at',
      defaultDesc: true,
      allowedColumns: sortableEntryColumns,
    },
    columnFilters: [
      { columnId: 'name', searchKey: 'name', type: 'string' },
      { columnId: 'test_type', searchKey: 'test_type', type: 'array' },
      {
        columnId: 'parent_test_type',
        searchKey: 'parent_test_type',
        type: 'array',
      },
      {
        columnId: 'document_status',
        searchKey: 'document_status',
        type: 'array',
      },
    ],
  })

  const filters: FullTestsFilters = useMemo(
    () => ({
      name: getString(columnFilters, 'name'),
      test_type: getArray(columnFilters, 'test_type'),
      parent_test_type: getArray(columnFilters, 'parent_test_type'),
      document_status: getArray(columnFilters, 'document_status'),
    }),
    [columnFilters]
  )

  const { data, count, isLoading, error, refetch } = useFullTestsData({
    pageIndex: pagination.pageIndex,
    pageSize: pagination.pageSize,
    filters,
    sorting: sorting?.[0],
  })

  const pageCount = Math.max(1, Math.ceil(count / pagination.pageSize))

  // eslint-disable-next-line react-hooks/incompatible-library
  const table = useReactTable({
    data,
    columns,
    state: {
      pagination,
      columnFilters,
      columnVisibility,
      sorting: sorting ?? [],
    },
    manualPagination: true,
    manualFiltering: true,
    manualSorting: true,
    enableMultiSort: false,
    pageCount,
    onPaginationChange,
    onColumnFiltersChange,
    onSortingChange,
    onColumnVisibilityChange: setColumnVisibility,
    getCoreRowModel: getCoreRowModel(),
  })

  useEffect(() => {
    ensurePageInRange(pageCount)
  }, [pageCount, ensurePageInRange])

  return (
    <div
      className={cn(
        'max-sm:has-[div[role="toolbar"]]:mb-16',
        'flex flex-1 flex-col gap-4'
      )}
    >
      <DataTableToolbar
        table={table}
        searchPlaceholder='Search by name...'
        searchKey='name'
        filters={[
          {
            columnId: 'test_type',
            title: 'Test Type',
            options: fullTestTypeOptions,
          },
          {
            columnId: 'parent_test_type',
            title: 'Parent Type',
            options: parentTestTypeOptions,
          },
          {
            columnId: 'document_status',
            title: 'Status',
            options: fullDocumentStatusOptions,
          },
        ]}
      />

      {error ? (
        <Alert variant='destructive'>
          <AlertCircle />
          <AlertTitle>Failed to load entries</AlertTitle>
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
            <EntryTableSkeleton columnCount={columns.length} />
          ) : (
            <Table>
              <TableHeader>
                {table.getHeaderGroups().map((headerGroup) => (
                  <TableRow key={headerGroup.id} className='group/row'>
                    {headerGroup.headers.map((header) => (
                      <TableHead key={header.id} colSpan={header.colSpan}>
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
                {table.getRowModel().rows.length ? (
                  table.getRowModel().rows.map((row) => (
                    <TableRow key={row.id} className='group/row'>
                      {row.getVisibleCells().map((cell) => (
                        <TableCell key={cell.id}>
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
                    <TableCell colSpan={columns.length} className='p-0'>
                      <EntryEmptyState />
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          )}
        </div>
      )}

      {!error && <DataTablePagination table={table} className='mt-auto' />}
    </div>
  )
}
