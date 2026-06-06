import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { type FeedbackStatus } from '../data/schema'
import { feedbackKeys } from './use-feedback-data'

export function useUpdateFeedbackStatus() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: { id: string; status: FeedbackStatus }) => {
      const { data, error } = await supabase
        .from('user_feedback')
        .update({
          status: input.status,
          updated_at: new Date().toISOString(),
        })
        .eq('id', input.id)
        .select('id')
      if (error) throw new Error(error.message)
      if (!data || data.length === 0) {
        throw new Error('Feedback item not found')
      }
    },
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: feedbackKeys.all }),
  })
}
