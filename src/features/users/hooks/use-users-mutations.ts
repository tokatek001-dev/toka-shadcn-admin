import { useMutation, useQueryClient } from '@tanstack/react-query'
import { FunctionsHttpError } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import { usersKeys } from './use-users-data'

export type AssignableRole = 'admin' | 'user'

type AdminUsersPayload =
  | {
      action: 'create'
      email: string
      password: string
      displayName: string
      role: AssignableRole
    }
  | { action: 'invite'; email: string; role: AssignableRole }
  | { action: 'delete'; userId: string }

async function invokeAdminUsers(payload: AdminUsersPayload) {
  const { data, error } = await supabase.functions.invoke('admin-users', {
    body: payload,
  })
  if (error) {
    let message = error.message
    if (error instanceof FunctionsHttpError) {
      const body = (await error.context.json().catch(() => null)) as {
        error?: string
      } | null
      if (body?.error) message = body.error
    }
    throw new Error(message)
  }
  return data as { ok: true; userId?: string }
}

function useInvalidateUsers() {
  const queryClient = useQueryClient()
  return () => queryClient.invalidateQueries({ queryKey: usersKeys.all })
}

export function useCreateUser() {
  const invalidate = useInvalidateUsers()
  return useMutation({
    mutationFn: (input: {
      email: string
      password: string
      displayName: string
      role: AssignableRole
    }) => invokeAdminUsers({ action: 'create', ...input }),
    onSuccess: invalidate,
  })
}

export function useInviteUser() {
  const invalidate = useInvalidateUsers()
  return useMutation({
    mutationFn: (input: { email: string; role: AssignableRole }) =>
      invokeAdminUsers({ action: 'invite', ...input }),
    onSuccess: invalidate,
  })
}

export function useDeleteUser() {
  const invalidate = useInvalidateUsers()
  return useMutation({
    mutationFn: (userId: string) =>
      invokeAdminUsers({ action: 'delete', userId }),
    onSuccess: invalidate,
  })
}

export function useDeleteUsers() {
  const invalidate = useInvalidateUsers()
  return useMutation({
    mutationFn: async (userIds: string[]) => {
      await Promise.all(
        userIds.map((userId) => invokeAdminUsers({ action: 'delete', userId }))
      )
    },
    onSuccess: invalidate,
  })
}

export function useUpdateUser() {
  const invalidate = useInvalidateUsers()
  return useMutation({
    mutationFn: async (input: {
      id: string
      displayName: string
      nickName: string | null
      role: AssignableRole
    }) => {
      const { error } = await supabase
        .from('user_profiles')
        .update({
          display_name: input.displayName,
          nick_name: input.nickName,
          role: input.role,
          updated_at: new Date().toISOString(),
        })
        .eq('id', input.id)
      if (error) throw new Error(error.message)
    },
    onSuccess: invalidate,
  })
}
