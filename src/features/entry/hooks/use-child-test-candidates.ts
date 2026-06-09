import { useQuery } from '@tanstack/react-query'
import { z } from 'zod'
import { supabase } from '@/lib/supabase'
import {
  type ChildSlot,
  type ChildSlotTable,
} from '../data/child-test-slots'

// Part-test rows carry `part`/`flag_type`; full-test rows don't. Two selects
// keep us from asking either table for a column it lacks.
const PART_SELECT =
  'id, name, base_id, part, level, test_type, flag_type, total_question, duration_in_second'
const FULL_SELECT =
  'id, name, base_id, level, test_type, total_question, duration_in_second'

const candidateSchema = z.object({
  id: z.string(),
  name: z.string().nullable(),
  base_id: z.string().nullable().optional(),
  part: z.string().nullable().optional(),
  level: z.string().nullable(),
  test_type: z.string().nullable(),
  flag_type: z.string().nullable().optional(),
  total_question: z.number().nullable(),
  duration_in_second: z.number().nullable(),
})
export type ChildTestCandidate = z.infer<typeof candidateSchema>

const candidateRowsSchema = z.array(candidateSchema)

// Largest published pool ≈ 600 part tests; the search box narrows further.
const CANDIDATE_LIMIT = 1000

const selectFor = (table: ChildSlotTable) =>
  table === 'data_entry_part_test' ? PART_SELECT : FULL_SELECT

async function fetchSlotCandidates(
  slot: ChildSlot,
  excludeId: string,
  search: string
): Promise<ChildTestCandidate[]> {
  let query = supabase
    .from(slot.table)
    .select(selectFor(slot.table))
    .eq('document_status', 'PUBLISHED')
    .eq('test_type', slot.testType)
    .order('name')
    .limit(CANDIDATE_LIMIT)

  if (slot.part) query = query.eq('part', slot.part)
  // FT slots pick child full tests; never offer the test itself.
  if (slot.table === 'data_entry_full_test' && excludeId) {
    query = query.neq('id', excludeId)
  }
  if (search.trim() !== '') {
    query = query.ilike('name', `%${search.trim()}%`)
  }

  const { data, error } = await query
  if (error) throw new Error(error.message)
  return candidateRowsSchema.parse(data ?? [])
}

export function useSlotCandidates({
  slot,
  excludeId,
  search,
}: {
  slot: ChildSlot | null
  excludeId: string
  search: string
}) {
  const query = useQuery({
    queryKey: [
      'entry',
      'child-candidates',
      slot?.table,
      slot?.testType,
      slot?.part ?? null,
      excludeId,
      search,
    ],
    queryFn: () => fetchSlotCandidates(slot!, excludeId, search),
    enabled: slot != null,
  })

  return {
    data: query.data ?? [],
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    error: query.error,
  }
}

// Resolve display info for ids already saved on the row. Querying by id (rather
// than reusing a candidate list) keeps names correct even if a child was later
// unpublished and dropped out of the candidate filter.
async function fetchTestsByIds(
  table: ChildSlotTable,
  ids: string[]
): Promise<ChildTestCandidate[]> {
  const { data, error } = await supabase
    .from(table)
    .select(selectFor(table))
    .in('id', ids)
  if (error) throw new Error(error.message)
  return candidateRowsSchema.parse(data ?? [])
}

export function useTestsByIds(table: ChildSlotTable | null, ids: string[]) {
  const query = useQuery({
    queryKey: ['entry', 'tests-by-ids', table, [...ids].sort()],
    queryFn: () => fetchTestsByIds(table!, ids),
    enabled: table != null && ids.length > 0,
  })

  return {
    data: query.data ?? [],
    isLoading: query.isLoading,
  }
}
