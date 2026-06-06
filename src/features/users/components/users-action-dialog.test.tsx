import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render } from 'vitest-browser-react'
import { userEvent } from 'vitest/browser'
import { type User } from '../data/schema'
import { UsersActionDialog } from './users-action-dialog'

const { createMutateAsync, updateMutateAsync } = vi.hoisted(() => ({
  createMutateAsync: vi.fn(),
  updateMutateAsync: vi.fn(),
}))
createMutateAsync.mockResolvedValue({ ok: true })
updateMutateAsync.mockResolvedValue(undefined)

vi.mock('../hooks/use-users-mutations', () => ({
  useCreateUser: () => ({ mutateAsync: createMutateAsync, isPending: false }),
  useUpdateUser: () => ({ mutateAsync: updateMutateAsync, isPending: false }),
}))

const MOCK_USER: User = {
  id: 'b37c0828-cd87-4983-86fb-ce94b24a9b24',
  displayName: 'Alex Smith',
  nickName: 'alex',
  avatarUrl: null,
  email: 'alex@smith.com',
  role: 'admin',
  createdAt: new Date('2026-01-01'),
  updatedAt: new Date('2026-02-02'),
}

describe('UsersActionDialog', () => {
  beforeEach(() => vi.clearAllMocks())

  describe('add user', () => {
    it('renders title and description', async () => {
      const { getByRole, getByText } = await render(
        <UsersActionDialog open onOpenChange={vi.fn()} />
      )

      await expect
        .element(getByRole('heading', { level: 2, name: /Add New User/i }))
        .toBeInTheDocument()
      await expect
        .element(getByText(/Create new user here/i))
        .toBeInTheDocument()
    })

    it('shows validation messages when submitted empty', async () => {
      const { getByRole, getByText } = await render(
        <UsersActionDialog open onOpenChange={vi.fn()} />
      )

      await userEvent.click(getByRole('button', { name: /Save Changes/i }))

      await expect
        .element(getByText('Display name is required.'))
        .toBeInTheDocument()
      await expect.element(getByText('Email is required.')).toBeInTheDocument()
      await expect.element(getByText('Role is required.')).toBeInTheDocument()
      await expect
        .element(getByText('Password is required.'))
        .toBeInTheDocument()
      expect(createMutateAsync).not.toHaveBeenCalled()
    })

    it('creates the user and closes when valid', async () => {
      const onOpenChange = vi.fn()
      const { getByRole, getByLabelText } = await render(
        <UsersActionDialog open onOpenChange={onOpenChange} />
      )

      await userEvent.fill(getByLabelText(/display name/i), 'John Doe')
      await userEvent.fill(getByLabelText(/^email$/i), 'john@example.com')
      await userEvent.click(getByRole('combobox', { name: /Role/i }))
      await userEvent.click(getByRole('option', { name: /^User$/i }))
      await userEvent.fill(getByLabelText(/^password$/i), 'S3cur3P@ssw0rd')
      await userEvent.fill(
        getByLabelText(/confirm password/i),
        'S3cur3P@ssw0rd'
      )

      await userEvent.click(getByRole('button', { name: /Save Changes/i }))

      await vi.waitFor(() => expect(createMutateAsync).toHaveBeenCalledOnce())
      expect(createMutateAsync).toHaveBeenCalledWith({
        email: 'john@example.com',
        password: 'S3cur3P@ssw0rd',
        displayName: 'John Doe',
        role: 'user',
      })
      await vi.waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false))
    })
  })

  describe('edit user', () => {
    it('prefills fields, disables email, hides password fields', async () => {
      const { getByLabelText, getByText } = await render(
        <UsersActionDialog open onOpenChange={vi.fn()} currentRow={MOCK_USER} />
      )

      await expect
        .element(getByLabelText(/display name/i))
        .toHaveValue(MOCK_USER.displayName)
      await expect.element(getByLabelText(/^email$/i)).toBeDisabled()
      await expect.element(getByText(/^Password$/i)).not.toBeInTheDocument()
    })

    it('updates the user on submit', async () => {
      const onOpenChange = vi.fn()
      const { getByRole, getByLabelText } = await render(
        <UsersActionDialog
          open
          onOpenChange={onOpenChange}
          currentRow={MOCK_USER}
        />
      )

      await userEvent.fill(getByLabelText(/nick name/i), 'aleksmith')
      await userEvent.click(getByRole('button', { name: /Save Changes/i }))

      await vi.waitFor(() => expect(updateMutateAsync).toHaveBeenCalledOnce())
      expect(updateMutateAsync).toHaveBeenCalledWith({
        id: MOCK_USER.id,
        displayName: MOCK_USER.displayName,
        nickName: 'aleksmith',
        role: 'admin',
      })
      await vi.waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false))
    })
  })
})
