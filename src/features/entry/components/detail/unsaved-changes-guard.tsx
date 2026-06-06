import { useBlocker } from '@tanstack/react-router'
import { ConfirmDialog } from '@/components/confirm-dialog'

type UnsavedChangesGuardProps = {
  when: boolean
}

/** Blocks in-app navigation while `when` is true; confirm proceeds. */
export function UnsavedChangesGuard({ when }: UnsavedChangesGuardProps) {
  const { proceed, reset, status } = useBlocker({
    shouldBlockFn: () => when,
    withResolver: true,
    enableBeforeUnload: when,
  })

  return (
    <ConfirmDialog
      open={status === 'blocked'}
      onOpenChange={(open) => {
        if (!open) reset?.()
      }}
      title='Có thay đổi chưa lưu'
      desc='Rời trang sẽ mất các thay đổi chưa lưu. Tiếp tục?'
      confirmText='Rời trang'
      destructive
      handleConfirm={() => proceed?.()}
    />
  )
}
