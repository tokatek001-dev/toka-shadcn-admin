import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Session, User } from '@supabase/supabase-js'

const {
  onAuthStateChange,
  getSession,
  signInWithPassword,
  signInWithOAuth,
  signOut,
  resetPasswordForEmail,
  updateUser,
} = vi.hoisted(() => {
  const onAuthStateChange = vi.fn().mockReturnValue({
    data: { subscription: { unsubscribe: vi.fn() } },
  })
  const getSession = vi
    .fn()
    .mockResolvedValue({ data: { session: null }, error: null })
  return {
    onAuthStateChange,
    getSession,
    signInWithPassword: vi.fn(),
    signInWithOAuth: vi.fn(),
    signOut: vi.fn(),
    resetPasswordForEmail: vi.fn(),
    updateUser: vi.fn(),
  }
})

vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      onAuthStateChange,
      getSession,
      signInWithPassword,
      signInWithOAuth,
      signOut,
      resetPasswordForEmail,
      updateUser,
    },
  },
  isAllowedEmail: (email?: string | null) =>
    !!email && email.toLowerCase().endsWith('@tokatek.com'),
  ALLOWED_EMAIL_DOMAIN: '@tokatek.com',
}))

// Defaults installed BEFORE the store first imports — the store hydrates
// at module load and we only get one shot at that initial getSession in
// browser-mode vitest (vi.resetModules + dynamic re-import does not
// re-invoke the mock factory reliably).
getSession.mockResolvedValue({ data: { session: null }, error: null })
onAuthStateChange.mockReturnValue({
  data: { subscription: { unsubscribe: vi.fn() } },
})

function makeSession(email: string): Session {
  return {
    access_token: 'a',
    refresh_token: 'r',
    expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    token_type: 'bearer',
    user: { id: 'u1', email } as User,
  } as Session
}

// Import once. The store is a module-level singleton.
import { useAuthStore } from './auth-store'

// Capture the onAuthStateChange handler registered at module init.
function getAuthHandler(): (event: string, session: Session | null) => void {
  const call = onAuthStateChange.mock.calls[0]
  if (!call) throw new Error('onAuthStateChange was not registered')
  return call[0] as (event: string, session: Session | null) => void
}

describe('useAuthStore', () => {
  beforeAll(async () => {
    // Wait for initial hydration (status: loading -> unauthenticated).
    await vi.waitFor(() =>
      expect(useAuthStore.getState().status).toBe('unauthenticated')
    )
  })

  beforeEach(() => {
    // Clear call history but preserve default implementations.
    signInWithPassword.mockReset()
    signInWithOAuth.mockReset()
    signOut.mockReset()
    resetPasswordForEmail.mockReset()
    updateUser.mockReset()
    // Reset store to a clean unauthenticated baseline.
    useAuthStore.setState({
      session: null,
      user: null,
      status: 'unauthenticated',
    })
  })

  it('is unauthenticated after initial hydration with null session', () => {
    // beforeAll already proved the loading->unauthenticated transition by
    // waiting on it. This test asserts the resolved state.
    expect(useAuthStore.getState().status).toBe('unauthenticated')
  })

  it('initial getSession with @tokatek.com session sets authenticated + allowed', () => {
    // Simulate the initial-session path by replaying the handler — same
    // code path that applySession() takes for getSession().
    const session = makeSession('user@tokatek.com')
    getAuthHandler()('INITIAL_SESSION', session)
    expect(useAuthStore.getState().status).toBe('authenticated')
    expect(useAuthStore.getState().isAllowed()).toBe(true)
    expect(useAuthStore.getState().user?.email).toBe('user@tokatek.com')
  })

  it('isAllowed false for non-tokatek email', () => {
    const session = makeSession('user@gmail.com')
    getAuthHandler()('INITIAL_SESSION', session)
    expect(useAuthStore.getState().status).toBe('authenticated')
    expect(useAuthStore.getState().isAllowed()).toBe(false)
  })

  it('signInWithPassword forwards to supabase and returns its error', async () => {
    signInWithPassword.mockResolvedValue({
      data: { session: null, user: null },
      error: { message: 'Invalid login credentials' },
    })
    const result = await useAuthStore
      .getState()
      .signInWithPassword('a@tokatek.com', 'pw')
    expect(signInWithPassword).toHaveBeenCalledWith({
      email: 'a@tokatek.com',
      password: 'pw',
    })
    expect(result.error?.message).toBe('Invalid login credentials')
  })

  it('signInWithGoogle calls signInWithOAuth with provider and redirect', async () => {
    signInWithOAuth.mockResolvedValue({ data: {}, error: null })
    await useAuthStore.getState().signInWithGoogle('/users')
    expect(signInWithOAuth).toHaveBeenCalledWith({
      provider: 'google',
      options: {
        redirectTo: expect.stringContaining('/oauth/callback?redirect=%2Fusers'),
      },
    })
  })

  it('signOut clears local session', async () => {
    // Seed an authenticated session first.
    getAuthHandler()('SIGNED_IN', makeSession('user@tokatek.com'))
    expect(useAuthStore.getState().status).toBe('authenticated')

    signOut.mockResolvedValue({ error: null })
    await useAuthStore.getState().signOut()
    expect(signOut).toHaveBeenCalled()
    expect(useAuthStore.getState().session).toBeNull()
    expect(useAuthStore.getState().user).toBeNull()
    expect(useAuthStore.getState().status).toBe('unauthenticated')
  })

  it('onAuthStateChange handler updates state on SIGNED_IN', () => {
    const session = makeSession('me@tokatek.com')
    getAuthHandler()('SIGNED_IN', session)
    expect(useAuthStore.getState().status).toBe('authenticated')
    expect(useAuthStore.getState().user?.email).toBe('me@tokatek.com')
  })
})
