import { afterEach, describe, expect, it, vi } from 'vitest'
import { render } from 'vitest-browser-react'

const uploadMediaMock = vi.fn()
vi.mock('../../data/upload', async (importOriginal) => {
  const mod = await importOriginal<typeof import('../../data/upload')>()
  return {
    ...mod,
    isUploadConfigured: () => true,
    uploadMedia: (...args: unknown[]) => uploadMediaMock(...args),
  }
})

import { EntryMediaSection } from './entry-media-section'

afterEach(() => {
  vi.unstubAllEnvs()
  uploadMediaMock.mockReset()
})

describe('EntryMediaSection', () => {
  it('renders an image preview when the item has a path', async () => {
    vi.stubEnv('VITE_MEDIA_BASE_URL', 'https://cdn.test/')
    const { container } = await render(
      <EntryMediaSection
        canEdit
        items={[
          {
            label: 'Cover',
            media: { name: 'c.png', path: 'PUBLIC/c.png' },
            kind: 'image',
          },
        ]}
      />
    )
    expect(container.querySelector('img')?.getAttribute('src')).toBe(
      'https://cdn.test/PUBLIC/c.png'
    )
  })

  it('disables Replace when no onReplaced handler is provided', async () => {
    const { getByRole } = await render(
      <EntryMediaSection
        canEdit
        items={[{ label: 'Cover', media: null, kind: 'image' }]}
      />
    )
    await expect
      .element(getByRole('button', { name: /replace/i }))
      .toBeDisabled()
  })

  it('uploads the picked file and calls onReplaced with a merged media object', async () => {
    uploadMediaMock.mockResolvedValue({
      path: 'entry/u-new.png',
      size: 7,
      contentType: 'image/png',
    })
    const onReplaced = vi.fn()
    const { getByRole, container } = await render(
      <EntryMediaSection
        canEdit
        items={[
          {
            label: 'Cover',
            media: {
              name: 'old.png',
              path: 'PUBLIC/old.png',
              alt: '',
              uploadedDate: 1,
            },
            kind: 'image',
            onReplaced,
          },
        ]}
      />
    )
    const btn = getByRole('button', { name: /replace/i })
    await expect.element(btn).toBeEnabled()

    const input = container.querySelector(
      'input[type="file"]'
    ) as HTMLInputElement
    const file = new File(['x'], 'new.png', { type: 'image/png' })
    const dt = new DataTransfer()
    dt.items.add(file)
    input.files = dt.files
    input.dispatchEvent(new Event('change', { bubbles: true }))

    await vi.waitFor(() => expect(onReplaced).toHaveBeenCalled())
    expect(onReplaced.mock.calls[0][0]).toMatchObject({
      name: 'new.png',
      path: 'entry/u-new.png',
      size: 7,
      uploadedDate: 1, // shape preserved from the existing object
    })
  })

  it('does not render Replace when canEdit is false', async () => {
    const { getByRole } = await render(
      <EntryMediaSection
        canEdit={false}
        items={[
          { label: 'Cover', media: null, kind: 'image', onReplaced: vi.fn() },
        ]}
      />
    )
    expect(getByRole('button', { name: /replace/i }).query()).toBeNull()
  })
})
