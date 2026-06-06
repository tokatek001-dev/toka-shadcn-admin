import { useState } from 'react'
import { Image as ImageIcon } from 'lucide-react'
import { mediaUrl } from '../data/media'
import { type MediaObject } from '../data/schema'

type EntryCoverCellProps = {
  cover: MediaObject | undefined
}

/**
 * 40x40 cover thumbnail. Falls back to a muted placeholder when the cover
 * is missing or the image fails to load (broken CDN path) — the cell keeps
 * its size either way so the row height never shifts.
 */
export function EntryCoverCell({ cover }: EntryCoverCellProps) {
  const [failed, setFailed] = useState(false)
  const src = mediaUrl(cover?.path)

  if (!src || failed) {
    return (
      <div
        data-slot='cover-placeholder'
        className='flex size-10 items-center justify-center rounded-md bg-muted'
      >
        <ImageIcon
          className='size-4 text-muted-foreground'
          aria-hidden='true'
        />
      </div>
    )
  }

  return (
    <img
      src={src}
      alt={cover?.name ?? ''}
      loading='lazy'
      className='size-10 rounded-md object-cover'
      onError={() => setFailed(true)}
    />
  )
}
