import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render } from 'vitest-browser-react'
import { userEvent } from 'vitest/browser'
import { UsersInviteDialog } from './users-invite-dialog'

const { inviteMutateAsync } = vi.hoisted(() => ({ inviteMutateAsync: vi.fn() }))
inviteMutateAsync.mockResolvedValue({ ok: true })

vi.mock('../hooks/use-users-mutations', () => ({
  useInviteUser: () => ({ mutateAsync: inviteMutateAsync, isPending: false }),
}))

describe('UsersInviteDialog', () => {
  beforeEach(() => vi.clearAllMocks())

  it('renders the dialog title and description', async () => {
    const { getByRole, getByText } = await render(
      <UsersInviteDialog open onOpenChange={vi.fn()} />
    )

    await expect
      .element(getByRole('heading', { level: 2, name: /Invite User/i }))
      .toBeInTheDocument()
    await expect
      .element(getByText(/Invite new user to join your team/i))
      .toBeInTheDocument()
  })

  it('shows error messages when submitting empty form', async () => {
    const { getByRole, getByText } = await render(
      <UsersInviteDialog open onOpenChange={vi.fn()} />
    )

    await userEvent.click(getByRole('button', { name: /Invite/i }))

    await expect
      .element(getByText(/Please enter an email to invite./i))
      .toBeInTheDocument()
    await expect.element(getByText(/Role is required./i)).toBeInTheDocument()
    expect(inviteMutateAsync).not.toHaveBeenCalled()
  })

  it('invites the user and closes when valid', async () => {
    const onOpenChange = vi.fn()
    const { getByRole } = await render(
      <UsersInviteDialog open onOpenChange={onOpenChange} />
    )

    await userEvent.fill(
      getByRole('textbox', { name: /Email/i }),
      'new@example.com'
    )
    await userEvent.click(getByRole('combobox', { name: /Role/i }))
    await userEvent.click(getByRole('option', { name: /^Admin$/i }))

    await userEvent.click(getByRole('button', { name: /Invite/i }))

    await vi.waitFor(() => expect(inviteMutateAsync).toHaveBeenCalledOnce())
    expect(inviteMutateAsync).toHaveBeenCalledWith({
      email: 'new@example.com',
      role: 'admin',
    })
    await vi.waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false))
  })
})
