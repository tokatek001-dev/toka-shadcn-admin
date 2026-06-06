import { Image as ImageIcon, Paperclip } from 'lucide-react'
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
import { isUploadConfigured } from '../../data/upload'

export type MediaItem = {
  label: string
  media: MediaObject | undefined
  kind: 'image' | 'file'
}

type EntryMediaSectionProps = {
  items: MediaItem[]
}

/**
 * Read-only media previews with a Replace button that stays disabled until
 * the upload seam (`data/upload.ts`) is configured (phase 2b-infra).
 */
export function EntryMediaSection({ items }: EntryMediaSectionProps) {
  return (
    <TooltipProvider>
      <Card>
        <CardHeader>
          <CardTitle>Media</CardTitle>
        </CardHeader>
        <CardContent className='flex flex-col gap-4'>
          {items.map((item) => {
            const src = mediaUrl(item.media?.path)
            return (
              <div key={item.label} className='flex items-center gap-3'>
                {item.kind === 'image' && src ? (
                  <img
                    src={src}
                    alt={item.media?.name ?? ''}
                    className='size-16 rounded-md border object-cover'
                  />
                ) : (
                  <div className='flex size-16 items-center justify-center rounded-md border bg-muted'>
                    {item.kind === 'image' ? (
                      <ImageIcon className='size-5 text-muted-foreground' aria-hidden='true' />
                    ) : (
                      <Paperclip className='size-5 text-muted-foreground' aria-hidden='true' />
                    )}
                  </div>
                )}
                <div className='min-w-0 flex-1'>
                  <div className='text-sm font-medium'>{item.label}</div>
                  <div className='truncate text-sm text-muted-foreground'>
                    {item.media?.name || 'No file'}
                  </div>
                </div>
                <Tooltip>
                  <TooltipTrigger asChild>
                    {/* span wrapper: disabled buttons don't fire tooltip events */}
                    <span tabIndex={0}>
                      <Button variant='outline' size='sm' disabled={!isUploadConfigured}>
                        Replace
                      </Button>
                    </span>
                  </TooltipTrigger>
                  <TooltipContent>Upload chưa được cấu hình</TooltipContent>
                </Tooltip>
              </div>
            )
          })}
        </CardContent>
      </Card>
    </TooltipProvider>
  )
}
