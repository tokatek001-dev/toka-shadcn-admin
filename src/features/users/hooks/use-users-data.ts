import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { userRowsSchema, type User, type UserRole } from '../data/schema'

export type UsersFilters = {
  search?: string
  role?: UserRole[]
}

type UseUsersDataParams = {
  pageIndex: number
  pageSize: number
  filters: UsersFilters
}

export const usersKeys = {
  all: ['users'] as const,
  list: (params: UseUsersDataParams) =>
    [...usersKeys.all, 'list', params] as const,
}

type UsersQueryResult = {
  rows: User[]
  count: number
}

async function fetchUsers({
  pageIndex,
  pageSize,
  filters,
}: UseUsersDataParams): Promise<UsersQueryResult> {
  const { data, error } = await supabase.rpc('admin_list_user_profiles', {
    p_page: pageIndex + 1,
    p_page_size: pageSize,
    p_search: filters.search?.trim() || null,
    p_roles: filters.role && filters.role.length > 0 ? filters.role : null,
  })

  if (error) {
    throw new Error(error.message)
  }

  const parsed = userRowsSchema.parse(data ?? [])
  const count = parsed[0]?.totalCount ?? 0
  const rows = parsed.map(({ totalCount: _totalCount, ...user }) => user)
  return { rows, count }
}

export function useUsersData(params: UseUsersDataParams) {
  const query = useQuery({
    queryKey: usersKeys.list(params),
    queryFn: () => fetchUsers(params),
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
