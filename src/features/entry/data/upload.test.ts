import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: vi.fn(async () => ({
        data: { session: { access_token: 'jwt-123' } },
      })),
    },
  },
}))

import { MAX_UPLOAD_BYTES, mergeMediaObject, uploadMedia } from './upload'

afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

describe('mergeMediaObject', () => {
  const file = new File(['x'], 'new.png', { type: 'image/png' })
  const uploaded = { path: 'entry/uuid-new.png', size: 1, contentType: 'image/png' }

  it('preserves camelCase extra keys on part-level media', () => {
    const existing = {
      name: 'old.png', path: 'PUBLIC/MEDIA/old.png', size: 9,
      alt: '', caption: '', fileType: null, originLink: null, uploadedDate: 123,
    }
    const merged = mergeMediaObject(existing, file, uploaded)
    expect(merged).toMatchObject({
      name: 'new.png', path: 'entry/uuid-new.png', size: 1,
      fileType: null, originLink: null, uploadedDate: 123,
    })
  })

  it('preserves snake_case extra keys on group media', () => {
    const existing = {
      name: 'old.png', path: 'PUBLIC/MEDIA/old.png', size: 9,
      alt: null, caption: null, file_type: 'PUBLIC', origin_link: null, uploaded_date: 1,
    }
    const merged = mergeMediaObject(existing, file, uploaded) as Record<string, unknown>
    expect(merged.file_type).toBe('PUBLIC')
    expect(merged.path).toBe('entry/uuid-new.png')
    expect(merged).not.toHaveProperty('fileType')
  })

  it('builds a minimal object when existing is null', () => {
    expect(mergeMediaObject(null, file, uploaded)).toEqual({
      alt: null, caption: null, name: 'new.png', path: 'entry/uuid-new.png', size: 1,
    })
  })
})

describe('uploadMedia', () => {
  it('posts multipart with Bearer token and returns the parsed result', async () => {
    vi.stubEnv('VITE_UPLOAD_API_URL', 'https://upload.test')
    const fetchMock = vi.fn(async () =>
      new Response(
        JSON.stringify({
          status: 'success',
          data: { path: 'entry/u-1.png', size: 5, content_type: 'image/png', etag: 'e' },
        }),
        { status: 200 }
      )
    )
    vi.stubGlobal('fetch', fetchMock)

    const out = await uploadMedia(new File(['abcde'], 'a.png', { type: 'image/png' }))

    expect(out).toEqual({ path: 'entry/u-1.png', size: 5, contentType: 'image/png' })
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('https://upload.test/api/files?prefix=entry')
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer jwt-123')
    expect(init.body).toBeInstanceOf(FormData)
  })

  it('throws a descriptive error on HTTP failure', async () => {
    vi.stubEnv('VITE_UPLOAD_API_URL', 'https://upload.test')
    vi.stubGlobal('fetch', vi.fn(async () =>
      new Response(JSON.stringify({ detail: 'boom' }), { status: 500 })
    ))
    await expect(uploadMedia(new File(['x'], 'a.png'))).rejects.toThrow(/boom|500/)
  })

  it('rejects oversized files before any network call', async () => {
    vi.stubEnv('VITE_UPLOAD_API_URL', 'https://upload.test')
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const big = { size: MAX_UPLOAD_BYTES + 1, name: 'big.bin' } as unknown as File
    await expect(uploadMedia(big)).rejects.toThrow(/100/)
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
