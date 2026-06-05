import type { User } from '@supabase/supabase-js'
import { describe, expect, it } from 'vitest'
import { deriveCurrentUser } from '@/hooks/use-current-user'

function makeUser(partial: Partial<User>): User {
  return {
    id: 'user-1',
    aud: 'authenticated',
    app_metadata: {},
    user_metadata: {},
    created_at: '2026-01-01T00:00:00Z',
    ...partial,
  } as User
}

describe('deriveCurrentUser', () => {
  it('uses full_name and avatar_url from user_metadata (Google OAuth)', () => {
    const user = makeUser({
      email: 'hau.lu@doltech.vn',
      user_metadata: {
        full_name: 'Hau Lu',
        avatar_url: 'https://lh3.googleusercontent.com/a/photo.jpg',
      },
    })

    expect(deriveCurrentUser(user)).toEqual({
      name: 'Hau Lu',
      email: 'hau.lu@doltech.vn',
      avatar: 'https://lh3.googleusercontent.com/a/photo.jpg',
      initials: 'HL',
    })
  })

  it('falls back to the email local part when full_name is missing', () => {
    const user = makeUser({ email: 'hau.lu@doltech.vn' })

    expect(deriveCurrentUser(user)).toEqual({
      name: 'hau.lu',
      email: 'hau.lu@doltech.vn',
      avatar: '',
      initials: 'HA',
    })
  })

  it('treats a whitespace-only full_name as missing', () => {
    const user = makeUser({
      email: 'hau.lu@doltech.vn',
      user_metadata: { full_name: '   ' },
    })

    expect(deriveCurrentUser(user).name).toBe('hau.lu')
  })

  it('uses the first letters of the first two words for initials', () => {
    const user = makeUser({
      email: 'a@b.com',
      user_metadata: { full_name: 'Nguyen Van An' },
    })

    expect(deriveCurrentUser(user).initials).toBe('NV')
  })

  it('returns empty fields for a null user', () => {
    expect(deriveCurrentUser(null)).toEqual({
      name: '',
      email: '',
      avatar: '',
      initials: '',
    })
  })
})
