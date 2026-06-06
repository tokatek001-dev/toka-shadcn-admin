import { afterEach, describe, expect, it, vi } from 'vitest'
import { joinMediaUrl, mediaUrl } from './media'

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('joinMediaUrl', () => {
  it('joins base and path with a single slash', () => {
    expect(joinMediaUrl('PUBLIC/MEDIA/a.png', 'https://cdn.example.com/')).toBe(
      'https://cdn.example.com/PUBLIC/MEDIA/a.png'
    )
  })

  it('normalizes a leading slash on the path', () => {
    expect(
      joinMediaUrl('/PUBLIC/MEDIA/a.png', 'https://cdn.example.com/')
    ).toBe('https://cdn.example.com/PUBLIC/MEDIA/a.png')
  })

  it('normalizes a missing trailing slash on the base', () => {
    expect(joinMediaUrl('PUBLIC/MEDIA/a.png', 'https://cdn.example.com')).toBe(
      'https://cdn.example.com/PUBLIC/MEDIA/a.png'
    )
  })

  it('returns null for null, undefined, or empty path', () => {
    expect(joinMediaUrl(null, 'https://cdn.example.com/')).toBeNull()
    expect(joinMediaUrl(undefined, 'https://cdn.example.com/')).toBeNull()
    expect(joinMediaUrl('   ', 'https://cdn.example.com/')).toBeNull()
  })

  it('returns null when the base URL is missing', () => {
    expect(joinMediaUrl('PUBLIC/MEDIA/a.png', undefined)).toBeNull()
    expect(joinMediaUrl('PUBLIC/MEDIA/a.png', '')).toBeNull()
  })
})

describe('mediaUrl', () => {
  it('resolves against VITE_MEDIA_BASE_URL from the environment', () => {
    vi.stubEnv('VITE_MEDIA_BASE_URL', 'https://cdn.test/')
    expect(mediaUrl('PUBLIC/MEDIA/a.png')).toBe(
      'https://cdn.test/PUBLIC/MEDIA/a.png'
    )
  })
})
