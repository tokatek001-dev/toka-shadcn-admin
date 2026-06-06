import { afterEach, describe, expect, it, vi } from 'vitest'
import { render } from 'vitest-browser-react'
import { EntryCoverCell } from './entry-cover-cell'

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('EntryCoverCell', () => {
  it('renders a placeholder when cover is null', async () => {
    const { container } = await render(<EntryCoverCell cover={null} />)
    expect(container.querySelector('img')).toBeNull()
    expect(
      container.querySelector('[data-slot="cover-placeholder"]')
    ).not.toBeNull()
  })

  it('renders a placeholder when cover has no path', async () => {
    const { container } = await render(
      <EntryCoverCell cover={{ name: 'x.png', path: null }} />
    )
    expect(container.querySelector('img')).toBeNull()
  })

  it('renders an image when the path resolves against the CDN base', async () => {
    vi.stubEnv('VITE_MEDIA_BASE_URL', 'https://cdn.test/')
    const { container } = await render(
      <EntryCoverCell
        cover={{ name: 'cover.png', path: 'PUBLIC/MEDIA/cover.png' }}
      />
    )
    const img = container.querySelector('img')
    expect(img).not.toBeNull()
    expect(img!.getAttribute('src')).toBe(
      'https://cdn.test/PUBLIC/MEDIA/cover.png'
    )
    expect(img!.getAttribute('alt')).toBe('cover.png')
  })
})
