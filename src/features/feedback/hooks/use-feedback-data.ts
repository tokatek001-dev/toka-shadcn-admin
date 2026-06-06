import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import {
  feedbackRowsSchema,
  type Feedback,
  type FeedbackStatus,
} from '../data/schema'

export type FeedbackFilters = {
  search?: string
  status?: FeedbackStatus[]
}

type UseFeedbackDataParams = {
  pageIndex: number
  pageSize: number
  filters: FeedbackFilters
}

export const feedbackKeys = {
  all: ['feedback'] as const,
  list: (params: UseFeedbackDataParams) =>
    [...feedbackKeys.all, 'list', params] as const,
}

const FEEDBACK_SELECT =
  'id, user_id, content, status, created_at, updated_at, user_profiles(display_name, avatar_url)'

type FeedbackQueryResult = {
  rows: Feedback[]
  count: number
}

async function fetchFeedback({
  pageIndex,
  pageSize,
  filters,
}: UseFeedbackDataParams): Promise<FeedbackQueryResult> {
  const from = pageIndex * pageSize
  const to = from + pageSize - 1

  let query = supabase
    .from('user_feedback')
    .select(FEEDBACK_SELECT, { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(from, to)

  if (filters.search && filters.search.trim() !== '') {
    query = query.ilike('content', `%${filters.search.trim()}%`)
  }
  if (filters.status && filters.status.length > 0) {
    query = query.in('status', filters.status)
  }

  const { data, count, error } = await query

  if (error) {
    throw new Error(error.message)
  }

  const rows = feedbackRowsSchema.parse(data ?? [])
  return { rows, count: count ?? 0 }
}

export function useFeedbackData(params: UseFeedbackDataParams) {
  const query = useQuery({
    queryKey: feedbackKeys.list(params),
    queryFn: () => fetchFeedback(params),
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
