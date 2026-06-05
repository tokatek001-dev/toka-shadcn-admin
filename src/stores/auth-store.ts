import type { AuthError, Session, User } from '@supabase/supabase-js'
import { create } from 'zustand'
import { supabase } from '@/lib/supabase'

type Status = 'loading' | 'authenticated' | 'unauthenticated'

interface AuthState {
  session: Session | null
  user: User | null
  status: Status
  signInWithPassword: (
    email: string,
    password: string
  ) => Promise<{ error: AuthError | null }>
  signInWithGoogle: (
    redirectPath?: string
  ) => Promise<{ error: AuthError | null }>
  signOut: () => Promise<void>
  sendPasswordReset: (email: string) => Promise<{ error: AuthError | null }>
  updatePassword: (newPassword: string) => Promise<{ error: AuthError | null }>
}

function applySession(
  set: (partial: Partial<AuthState>) => void,
  session: Session | null
) {
  set({
    session,
    user: session?.user ?? null,
    status: session ? 'authenticated' : 'unauthenticated',
  })
}

export const useAuthStore = create<AuthState>()((set) => {
  // Hydrate from existing session, then subscribe to changes.
  // Race note: onAuthStateChange also fires INITIAL_SESSION shortly after
  // subscription. Last-write-wins via applySession; supabase-js coalesces
  // these so the resolved state is consistent.
  void supabase.auth.getSession().then(({ data }) => {
    applySession(set, data.session)
  })

  supabase.auth.onAuthStateChange((_event, session) => {
    applySession(set, session)
  })

  return {
    session: null,
    user: null,
    status: 'loading',

    async signInWithPassword(email, password) {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      })
      return { error }
    },

    async signInWithGoogle(redirectPath) {
      const callback = new URL('/oauth/callback', window.location.origin)
      if (redirectPath) callback.searchParams.set('redirect', redirectPath)
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: callback.toString() },
      })
      return { error }
    },

    async signOut() {
      await supabase.auth.signOut()
      // Apply synchronously so callers awaiting signOut see status flip
      // immediately. The SIGNED_OUT listener will re-apply (idempotent).
      applySession(set, null)
    },

    async sendPasswordReset(email) {
      const redirectTo = `${window.location.origin}/reset-password`
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo,
      })
      return { error }
    },

    async updatePassword(newPassword) {
      const { error } = await supabase.auth.updateUser({
        password: newPassword,
      })
      return { error }
    },
  }
})
