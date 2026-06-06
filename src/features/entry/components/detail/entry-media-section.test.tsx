import { afterEach, describe, expect, it, vi } from 'vitest'
import { render } from 'vitest-browser-react'
import { EntryMediaSection } from './entry-media-section'

afterEach(() => vi.unstubAllEnvs())

describe('EntryMediaSection', () => {
  it('renders an image preview when the item has a path', async () => {
    vi.stubEnv('VITE_MEDIA_BASE_URL', 'https://cdn.test/')
    const { container } = await render(
      <EntryMediaSection
        items={[{ label: 'Cover', media: { name: 'c.png', path: 'PUBLIC/c.png' }, kind: 'image' }]}
      />
    )
    expect(container.querySelector('img')?.getAttribute('src')).toBe(
      'https://cdn.test/PUBLIC/c.png'
    )
  })

  it('renders a no-file placeholder and a disabled Replace button', async () => {
    const { container, getByRole } = await render(
      <EntryMediaSection items={[{ label: 'Cover', media: null, kind: 'image' }]} />
    )
    expect(container.querySelector('img')).toBeNull()
    const btn = getByRole('button', { name: /replace/i })
    await expect.element(btn).toBeDisabled()
  })

  it('shows the file name for audio media', async () => {
    const { getByText } = await render(
      <EntryMediaSection
        items={[{ label: 'Audio', media: { name: 'a.mp3', path: 'PUBLIC/a.mp3' }, kind: 'file' }]}
      />
    )
    await expect.element(getByText('a.mp3')).toBeInTheDocument()
  })
})
