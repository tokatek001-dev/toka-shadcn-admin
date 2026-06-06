import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import {
  FULL_TEST_SELECT,
  fullTestRowsSchema,
  sortableEntryColumns,
  type FullTest,
} from '../data/schema'
import { type EntrySorting } from './use-part-tests-data'

export type FullTestsFilters = {
  name?: string
  test_type?: string[]
  parent_test_type?: string[]
  document_status?: string[]
}

const DEFAULT_SORTING: EntrySorting = { id: 'updated_at', desc: true }

type UseFullTestsDataParams = {
  pageIndex: number
  pageSize: number
  filters: FullTestsFilters
  sorting?: EntrySorting
}

export const fullTestsKeys = {
  all: ['entry', 'full-tests'] as const,
  list: (params: UseFullTestsDataParams) =>
    [...fullTestsKeys.all, params] as const,
}

type FullTestsQueryResult = {
  rows: FullTest[]
  count: number
}

async function fetchFullTests({
  pageIndex,
  pageSize,
  filters,
  sorting = DEFAULT_SORTING,
}: UseFullTestsDataParams): Promise<FullTestsQueryResult> {
  const from = pageIndex * pageSize
  const to = from + pageSize - 1

  const sortColumn = (sortableEntryColumns as readonly string[]).includes(
    sorting.id
  )
    ? sorting.id
    : DEFAULT_SORTING.id

  let query = supabase
    .from('data_entry_full_test')
    .select(FULL_TEST_SELECT, { count: 'exact' })
    .order(sortColumn, { ascending: !sorting.desc })
    .range(from, to)

  if (filters.name && filters.name.trim() !== '') {
    query = query.ilike('name', `%${filters.name.trim()}%`)
  }
  if (filters.test_type && filters.test_type.length > 0) {
    query = query.in('test_type', filters.test_type)
  }
  if (filters.parent_test_type && filters.parent_test_type.length > 0) {
    query = query.in('parent_test_type', filters.parent_test_type)
  }
  if (filters.document_status && filters.document_status.length > 0) {
    query = query.in('document_status', filters.document_status)
  }

  const { data, count, error } = await query

  if (error) {
    throw new Error(error.message)
  }

  const rows = fullTestRowsSchema.parse(data ?? [])
  return { rows, count: count ?? 0 }
}

export function useFullTestsData(params: UseFullTestsDataParams) {
  const query = useQuery({
    queryKey: fullTestsKeys.list(params),
    queryFn: () => fetchFullTests(params),
    placeholderData: keepPreviousData,
  })

  return {
    data: query.data?.rows ?? [],
    count: query.data?.count ?? 0,
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    error: query.error,
    refetch: query.refetch,
  }
}
