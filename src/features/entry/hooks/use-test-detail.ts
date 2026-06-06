import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import {
  fullTestDetailSchema,
  partTestDetailSchema,
  type EntryKind,
  type FullTestDetail,
  type PartTestDetail,
} from '../data/detail-schema'

const TABLE: Record<EntryKind, string> = {
  part: 'data_entry_part_test',
  full: 'data_entry_full_test',
}

export const testDetailKeys = {
  detail: (kind: EntryKind, id: string) =>
    ['entry', kind, 'detail', id] as const,
}

export class NotFoundError extends Error {}

// Mirrors the global policy (main.tsx) + never retry not-found.
const detailRetry = (failureCount: number, error: Error) => {
  if (error instanceof NotFoundError) return false
  if (import.meta.env.DEV) return false
  return failureCount < 3
}

async function fetchDetail(kind: EntryKind, id: string) {
  const { data, error } = await supabase
    .from(TABLE[kind])
    .select('*')
    .eq('id', id)
    .maybeSingle()
  if (error) throw new Error(error.message)
  if (!data) throw new NotFoundError('Test not found')
  return kind === 'part'
    ? partTestDetailSchema.parse(data)
    : fullTestDetailSchema.parse(data)
}

export function usePartTestDetail(id: string) {
  return useQuery<PartTestDetail>({
    queryKey: testDetailKeys.detail('part', id),
    queryFn: () => fetchDetail('part', id) as Promise<PartTestDetail>,
    retry: detailRetry,
  })
}

export function useFullTestDetail(id: string) {
  return useQuery<FullTestDetail>({
    queryKey: testDetailKeys.detail('full', id),
    queryFn: () => fetchDetail('full', id) as Promise<FullTestDetail>,
    retry: detailRetry,
  })
}
