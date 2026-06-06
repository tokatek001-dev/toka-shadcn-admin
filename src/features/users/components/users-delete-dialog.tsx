'use client'

import { useState } from 'react'
import { AlertTriangle } from 'lucide-react'
import { toast } from 'sonner'
import { useAuthStore } from '@/stores/auth-store'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { type User } from '../data/schema'
import { useDeleteUser } from '../hooks/use-users-mutations'

type UserDeleteDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  currentRow: User
}

export function UsersDeleteDialog({
  open,
  onOpenChange,
  currentRow,
}: UserDeleteDialogProps) {
  const [value, setValue] = useState('')
  const authUser = useAuthStore((s) => s.user)
  const deleteUser = useDeleteUser()
  const isSelf = authUser?.id === currentRow.id

  const handleDelete = async () => {
    if (isSelf || value.trim() !== currentRow.email) return
    try {
      await deleteUser.mutateAsync(currentRow.id)
      toast.success('User deleted')
      onOpenChange(false)
    } catch {
      // Error toast is shown by the global mutation onError handler.
    }
  }

  return (
    <ConfirmDialog
      open={open}
      onOpenChange={onOpenChange}
      form='users-delete-form'
      disabled={
        isSelf || deleteUser.isPending || value.trim() !== currentRow.email
      }
      title={
        <span className='text-destructive'>
          <AlertTriangle
            className='me-1 inline-block stroke-destructive'
            size={18}
          />{' '}
          Delete User
        </span>
      }
      desc={
        <form
          id='users-delete-form'
          onSubmit={(e) => {
            e.preventDefault()
            void handleDelete()
          }}
          className='space-y-4'
        >
          <p className='mb-2'>
            Are you sure you want to delete{' '}
            <span className='font-bold'>
              {currentRow.displayName || currentRow.email}
            </span>
            ?
            <br />
            This action will permanently remove the user with the role of{' '}
            <span className='font-bold'>
              {currentRow.role.toUpperCase()}
            </span>{' '}
            from the system. This cannot be undone.
          </p>

          <Label className='my-2'>
            Email:
            <Input
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder='Enter email to confirm deletion.'
              disabled={isSelf}
              autoFocus
            />
          </Label>

          {isSelf ? (
            <Alert variant='destructive'>
              <AlertTitle>Not allowed</AlertTitle>
              <AlertDescription>
                You cannot delete your own account.
              </AlertDescription>
            </Alert>
          ) : (
            <Alert variant='destructive'>
              <AlertTitle>Warning!</AlertTitle>
              <AlertDescription>
                Please be careful, this operation can not be rolled back.
              </AlertDescription>
            </Alert>
          )}
        </form>
      }
      confirmText='Delete'
      destructive
    />
  )
}
