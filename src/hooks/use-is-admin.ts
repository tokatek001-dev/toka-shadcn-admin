import { useQuery } from '@tanstack/react-query'
import { useAuthStore } from '@/stores/auth-store'
import { supabase } from '@/lib/supabase'

/**
 * UX-level role check (RLS is the real enforcement). `user_profiles.id` IS
 * the auth user id; users can always read their own profile.
 */
export function useIsAdmin() {
  const user = useAuthStore((s) => s.user)

  const query = useQuery({
    queryKey: ['current-user-role', user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('user_profiles')
        .select('role')
        .eq('id', user!.id)
        .maybeSingle()
      if (error) throw new Error(error.message)
      // No profile row → not an admin (fail closed, no error noise).
      return (data as { role: string | null } | null)?.role ?? null
    },
  })

  return {
    isAdmin: query.data === 'admin',
    isLoading: !user || query.isLoading,
  }
}
