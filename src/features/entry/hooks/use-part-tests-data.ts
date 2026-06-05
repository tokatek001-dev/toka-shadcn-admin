import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import {
  PART_TEST_SELECT,
  partTestRowsSchema,
  type PartTest,
} from '../data/schema'

export type PartTestsFilters = {
  name?: string
  part?: string[]
  test_type?: string[]
  level?: string[]
  document_status?: string[]
}

type UsePartTestsDataParams = {
  pageIndex: number
  pageSize: number
  filters: PartTestsFilters
}

export const partTestsKeys = {
  all: ['entry', 'part-tests'] as const,
  list: (params: UsePartTestsDataParams) =>
    [...partTestsKeys.all, params] as const,
}

type PartTestsQueryResult = {
  rows: PartTest[]
  count: number
}

async function fetchPartTests({
  pageIndex,
  pageSize,
  filters,
}: UsePartTestsDataParams): Promise<PartTestsQueryResult> {
  const from = pageIndex * pageSize
  const to = from + pageSize - 1

  let query = supabase
    .from('data_entry_part_test')
    .select(PART_TEST_SELECT, { count: 'exact' })
    .order('updated_at', { ascending: false })
    .range(from, to)

  if (filters.name && filters.name.trim() !== '') {
    query = query.ilike('name', `%${filters.name.trim()}%`)
  }
  if (filters.part && filters.part.length > 0) {
    query = query.in('part', filters.part)
  }
  if (filters.test_type && filters.test_type.length > 0) {
    query = query.in('test_type', filters.test_type)
  }
  if (filters.level && filters.level.length > 0) {
    query = query.in('level', filters.level)
  }
  if (filters.document_status && filters.document_status.length > 0) {
    query = query.in('document_status', filters.document_status)
  }

  const { data, count, error } = await query

  if (error) {
    throw new Error(error.message)
  }

  const rows = partTestRowsSchema.parse(data ?? [])
  return { rows, count: count ?? 0 }
}

export function usePartTestsData(params: UsePartTestsDataParams) {
  const query = useQuery({
    queryKey: partTestsKeys.list(params),
    queryFn: () => fetchPartTests(params),
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
