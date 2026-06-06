import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useAuthStore } from '@/stores/auth-store'
import { supabase } from '@/lib/supabase'
import { type EntryKind } from '../data/detail-schema'
import { fullTestsKeys } from './use-full-tests-data'
import { partTestsKeys } from './use-part-tests-data'
import { testDetailKeys } from './use-test-detail'

const TABLE: Record<EntryKind, string> = {
  part: 'data_entry_part_test',
  full: 'data_entry_full_test',
}

/** Someone else saved between our load and our save. */
export class ConflictError extends Error {
  constructor() {
    super(
      'This test was modified by someone else. Reload to get the latest version.'
    )
  }
}

export function assertUpdateApplied(rows: unknown[] | null): void {
  if (!rows || rows.length === 0) throw new ConflictError()
}

type UpdateInput = {
  id: string
  /** version loaded with the form — compare-and-swap guard */
  version: number
  payload: Record<string, unknown>
}

export function useUpdateTest(kind: EntryKind) {
  const queryClient = useQueryClient()
  const email = useAuthStore((s) => s.user?.email)

  return useMutation({
    mutationFn: async ({ id, version, payload }: UpdateInput) => {
      const { data, error } = await supabase
        .from(TABLE[kind])
        .update({
          ...payload,
          version: version + 1,
          updated_by: email ?? 'unknown',
          updated_at: new Date().toISOString(),
        })
        .eq('id', id)
        .eq('version', version)
        .select('id')
      if (error) throw new Error(error.message)
      assertUpdateApplied(data)
    },
    onSuccess: (_data, { id }) => {
      void queryClient.invalidateQueries({
        queryKey: testDetailKeys.detail(kind, id),
      })
      void queryClient.invalidateQueries({
        queryKey: kind === 'part' ? partTestsKeys.all : fullTestsKeys.all,
      })
    },
  })
}
