import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render } from 'vitest-browser-react'
import { userEvent } from 'vitest/browser'
import { type User } from '../data/schema'
import { UsersDeleteDialog } from './users-delete-dialog'

const { deleteMutateAsync } = vi.hoisted(() => ({ deleteMutateAsync: vi.fn() }))
deleteMutateAsync.mockResolvedValue({ ok: true })

vi.mock('../hooks/use-users-mutations', () => ({
  useDeleteUser: () => ({ mutateAsync: deleteMutateAsync, isPending: false }),
}))

// The signed-in admin id used for the self-delete guard.
vi.mock('@/stores/auth-store', () => ({
  useAuthStore: (selector: (s: { user: { id: string } }) => unknown) =>
    selector({ user: { id: 'self-admin-id' } }),
}))

const MOCK_USER: User = {
  id: 'other-user-id',
  displayName: 'John Doe',
  nickName: 'johnd',
  avatarUrl: null,
  email: 'johndoe@example.com',
  role: 'user',
  createdAt: new Date('2026-01-01'),
  updatedAt: new Date('2026-02-02'),
}

describe('UsersDeleteDialog', () => {
  beforeEach(() => vi.clearAllMocks())

  it('keeps the delete button disabled until the email is typed correctly', async () => {
    const { getByRole } = await render(
      <UsersDeleteDialog open onOpenChange={vi.fn()} currentRow={MOCK_USER} />
    )

    const emailInput = getByRole('textbox', { name: /Email/i })
    const deleteButton = getByRole('button', { name: /Delete/i })

    await expect.element(deleteButton).toBeDisabled()

    await userEvent.fill(emailInput, 'wrong@example.com')
    await expect.element(deleteButton).toBeDisabled()

    await userEvent.fill(emailInput, MOCK_USER.email)
    await expect.element(deleteButton).toBeEnabled()
  })

  it('deletes the user and closes on confirm', async () => {
    const onOpenChange = vi.fn()
    const { getByRole } = await render(
      <UsersDeleteDialog
        open
        onOpenChange={onOpenChange}
        currentRow={MOCK_USER}
      />
    )

    await userEvent.fill(
      getByRole('textbox', { name: /Email/i }),
      MOCK_USER.email
    )
    await userEvent.click(getByRole('button', { name: /Delete/i }))

    await vi.waitFor(() => expect(deleteMutateAsync).toHaveBeenCalledOnce())
    expect(deleteMutateAsync).toHaveBeenCalledWith(MOCK_USER.id)
    await vi.waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false))
  })

  it('blocks deleting your own account', async () => {
    const SELF: User = { ...MOCK_USER, id: 'self-admin-id' }
    const { getByRole, getByText } = await render(
      <UsersDeleteDialog open onOpenChange={vi.fn()} currentRow={SELF} />
    )

    await expect
      .element(getByText(/You cannot delete your own account/i))
      .toBeInTheDocument()

    // Input is disabled when isSelf — button stays disabled regardless
    await expect
      .element(getByRole('textbox', { name: /Email/i }))
      .toBeDisabled()
    await expect
      .element(getByRole('button', { name: /Delete/i }))
      .toBeDisabled()
    expect(deleteMutateAsync).not.toHaveBeenCalled()
  })
})
