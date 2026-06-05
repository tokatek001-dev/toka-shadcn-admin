import type { User } from '@supabase/supabase-js'
import { useAuthStore } from '@/stores/auth-store'

type CurrentUser = {
  name: string
  email: string
  avatar: string
  initials: string
}

export function deriveCurrentUser(user: User | null): CurrentUser {
  if (!user) return { name: '', email: '', avatar: '', initials: '' }

  const email = user.email ?? ''
  const metadata = user.user_metadata ?? {}
  const fullName =
    typeof metadata.full_name === 'string' ? metadata.full_name.trim() : ''
  const name = fullName || email.split('@')[0]
  const avatar =
    typeof metadata.avatar_url === 'string' ? metadata.avatar_url : ''

  const words = name.split(/\s+/).filter(Boolean)
  const initials =
    words.length >= 2
      ? (words[0][0] + words[1][0]).toUpperCase()
      : name.slice(0, 2).toUpperCase()

  return { name, email, avatar, initials }
}

export function useCurrentUser(): CurrentUser {
  const user = useAuthStore((state) => state.user)
  return deriveCurrentUser(user)
}
