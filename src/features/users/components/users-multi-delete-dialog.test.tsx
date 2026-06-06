import { createTableMock } from '@/test-utils/tanstack-table'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render } from 'vitest-browser-react'
import { userEvent } from 'vitest/browser'
import { UsersMultiDeleteDialog } from './users-multi-delete-dialog'

const { deleteUsersMutateAsync } = vi.hoisted(() => ({
  deleteUsersMutateAsync: vi.fn(),
}))
deleteUsersMutateAsync.mockResolvedValue(undefined)

vi.mock('../hooks/use-users-mutations', () => ({
  useDeleteUsers: () => ({
    mutateAsync: deleteUsersMutateAsync,
    isPending: false,
  }),
}))

vi.mock('@/stores/auth-store', () => ({
  useAuthStore: (selector: (s: { user: { id: string } }) => unknown) =>
    selector({ user: { id: 'self-admin-id' } }),
}))

const USERS = [
  { id: 'user-1', email: 'a@example.com' },
  { id: 'user-2', email: 'b@example.com' },
]

describe('UsersMultiDeleteDialog', () => {
  beforeEach(() => vi.clearAllMocks())

  it('keeps the delete button disabled until DELETE is typed', async () => {
    const { table } = createTableMock(2, USERS)
    const { getByRole } = await render(
      <UsersMultiDeleteDialog open onOpenChange={vi.fn()} table={table} />
    )

    const confirmInput = getByRole('textbox', {
      name: /Confirm by typing "DELETE"/i,
    })
    const deleteButton = getByRole('button', { name: /Delete/i })

    await expect.element(deleteButton).toBeDisabled()
    await userEvent.fill(confirmInput, 'DELETE')
    await expect.element(deleteButton).toBeEnabled()
  })

  it('deletes the selected users', async () => {
    const { table, resetRowSelection } = createTableMock(2, USERS)
    const onOpenChange = vi.fn()
    const { getByRole } = await render(
      <UsersMultiDeleteDialog open onOpenChange={onOpenChange} table={table} />
    )

    await userEvent.fill(
      getByRole('textbox', { name: /Confirm by typing "DELETE"/i }),
      'DELETE'
    )
    await userEvent.click(getByRole('button', { name: /Delete/i }))

    expect(onOpenChange).toHaveBeenCalledWith(false)
    await vi.waitFor(() =>
      expect(deleteUsersMutateAsync).toHaveBeenCalledWith(['user-1', 'user-2'])
    )
    await vi.waitFor(() => expect(resetRowSelection).toHaveBeenCalledOnce())
  })

  it('excludes the signed-in admin from deletion', async () => {
    const withSelf = [
      { id: 'self-admin-id', email: 'me@example.com' },
      ...USERS,
    ]
    const { table } = createTableMock(3, withSelf)
    const { getByRole, getByText } = await render(
      <UsersMultiDeleteDialog open onOpenChange={vi.fn()} table={table} />
    )

    await expect
      .element(getByText(/your own account is excluded/i))
      .toBeInTheDocument()

    await userEvent.fill(
      getByRole('textbox', { name: /Confirm by typing "DELETE"/i }),
      'DELETE'
    )
    await userEvent.click(getByRole('button', { name: /Delete/i }))

    await vi.waitFor(() =>
      expect(deleteUsersMutateAsync).toHaveBeenCalledWith(['user-1', 'user-2'])
    )
  })
})
