import { SearchX } from 'lucide-react'

export function EntryEmptyState() {
  return (
    <div className='flex h-48 flex-col items-center justify-center gap-2 text-center'>
      <SearchX className='size-8 text-muted-foreground' />
      <p className='font-medium'>No entries found</p>
      <p className='max-w-sm text-sm text-muted-foreground'>
        Try adjusting your search or filters to find what you are looking for.
      </p>
    </div>
  )
}
