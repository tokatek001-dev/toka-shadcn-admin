import { describe, it, expect, vi } from 'vitest'

describe('supabase client', () => {
  it('exports a client with auth namespace', async () => {
    vi.stubEnv('VITE_SUPABASE_URL', 'https://example.supabase.co')
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'anon-key')
    const { supabase } = await import('./supabase')
    expect(supabase).toBeTruthy()
    expect(typeof supabase.auth.getSession).toBe('function')
    expect(typeof supabase.auth.onAuthStateChange).toBe('function')
  })
})
