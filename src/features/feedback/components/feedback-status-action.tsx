import { DotsHorizontalIcon } from '@radix-ui/react-icons'
import { type Row } from '@tanstack/react-table'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { feedbackStatuses } from '../data/data'
import { type Feedback, type FeedbackStatus } from '../data/schema'
import { useUpdateFeedbackStatus } from '../hooks/use-feedback-mutations'

type FeedbackStatusActionProps = {
  row: Row<Feedback>
}

export function FeedbackStatusAction({ row }: FeedbackStatusActionProps) {
  const updateStatus = useUpdateFeedbackStatus()

  const handleChange = async (value: string) => {
    if (value === row.original.status) return
    try {
      await updateStatus.mutateAsync({
        id: row.original.id,
        status: value as FeedbackStatus,
      })
      toast.success('Status updated')
    } catch {
      // Error toast is shown by the global mutation onError handler.
    }
  }

  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <Button
          variant='ghost'
          className='flex h-8 w-8 p-0 data-[state=open]:bg-muted'
          disabled={updateStatus.isPending}
        >
          <DotsHorizontalIcon className='h-4 w-4' />
          <span className='sr-only'>Open menu</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align='end' className='w-44'>
        <DropdownMenuLabel>Set status</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuRadioGroup
          value={row.original.status}
          onValueChange={(value) => void handleChange(value)}
        >
          {feedbackStatuses.map(({ label, value }) => (
            <DropdownMenuRadioItem key={value} value={value}>
              {label}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
