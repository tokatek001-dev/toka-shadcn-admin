import { useRef, useState } from 'react'
import { Image as ImageIcon, Loader2, Paperclip } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { mediaUrl } from '../../data/media'
import { type MediaObject } from '../../data/schema'
import {
  isUploadConfigured,
  mergeMediaObject,
  uploadMedia,
} from '../../data/upload'

type MediaItem = {
  label: string
  media: MediaObject | undefined
  kind: 'image' | 'file'
  /** Defaults: image/* for images, audio/* for files. */
  accept?: string
  /** When provided (and canEdit), Replace becomes active. */
  onReplaced?: (media: NonNullable<MediaObject>) => void
}

type EntryMediaSectionProps = {
  items: MediaItem[]
  canEdit?: boolean
}

/**
 * Media previews with a Replace button. When `canEdit` and an `onReplaced`
 * handler are present and the upload API is configured, Replace opens a file
 * picker, uploads through the R2 API, and hands back a shape-merged media
 * object. Otherwise the button is hidden (no edit) or disabled (no handler /
 * upload not configured).
 */
export function EntryMediaSection({ items, canEdit }: EntryMediaSectionProps) {
  return (
    <TooltipProvider>
      <Card>
        <CardHeader>
          <CardTitle>Media</CardTitle>
        </CardHeader>
        <CardContent className='flex flex-col gap-4'>
          {items.map((item) => (
            <MediaRow key={item.label} item={item} canEdit={!!canEdit} />
          ))}
        </CardContent>
      </Card>
    </TooltipProvider>
  )
}

function MediaRow({ item, canEdit }: { item: MediaItem; canEdit: boolean }) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const src = mediaUrl(item.media?.path)
  const configured = isUploadConfigured()
  const enabled = configured && !!item.onReplaced && !busy

  const pick = async (file: File | undefined) => {
    if (!file || !item.onReplaced) return
    setBusy(true)
    try {
      const uploaded = await uploadMedia(file)
      item.onReplaced(mergeMediaObject(item.media, file, uploaded))
      toast.success(`${item.label}: đã upload ${file.name}`)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Upload failed')
    } finally {
      setBusy(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  const button = (
    <Button
      variant='outline'
      size='sm'
      disabled={!enabled}
      onClick={() => inputRef.current?.click()}
    >
      {busy && <Loader2 className='me-1 size-3.5 animate-spin' />}
      Replace
    </Button>
  )

  return (
    <div className='flex items-center gap-3'>
      {item.kind === 'image' && src ? (
        <img
          src={src}
          alt={item.media?.name ?? ''}
          className='size-16 rounded-md border object-cover'
        />
      ) : (
        <div className='flex size-16 items-center justify-center rounded-md border bg-muted'>
          {item.kind === 'image' ? (
            <ImageIcon
              className='size-5 text-muted-foreground'
              aria-hidden='true'
            />
          ) : (
            <Paperclip
              className='size-5 text-muted-foreground'
              aria-hidden='true'
            />
          )}
        </div>
      )}
      <div className='min-w-0 flex-1'>
        <div className='text-sm font-medium'>{item.label}</div>
        <div className='truncate text-sm text-muted-foreground'>
          {item.media?.name || 'No file'}
        </div>
      </div>
      {canEdit && (
        <>
          <input
            ref={inputRef}
            type='file'
            className='hidden'
            accept={
              item.accept ?? (item.kind === 'image' ? 'image/*' : 'audio/*')
            }
            onChange={(e) => void pick(e.target.files?.[0])}
          />
          {configured ? (
            button
          ) : (
            <Tooltip>
              <TooltipTrigger asChild>
                <span tabIndex={0}>{button}</span>
              </TooltipTrigger>
              <TooltipContent>Upload chưa được cấu hình</TooltipContent>
            </Tooltip>
          )}
        </>
      )}
    </div>
  )
}
