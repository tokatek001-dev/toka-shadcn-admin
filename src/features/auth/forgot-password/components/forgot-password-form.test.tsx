import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, type RenderResult } from 'vitest-browser-react'
import { userEvent, type Locator } from 'vitest/browser'
import { useAuthStore } from '@/stores/auth-store'
import { ForgotPasswordForm } from './forgot-password-form'

const sendPasswordResetMock = vi.fn(() => Promise.resolve())

vi.mock('@/stores/auth-store', () => ({
  useAuthStore: {
    getState: () => ({ sendPasswordReset: sendPasswordResetMock }),
  },
}))

describe('ForgotPasswordForm', () => {
  let screen: RenderResult
  let emailInput: Locator
  let submitButton: Locator

  beforeEach(async () => {
    vi.clearAllMocks()

    screen = await render(<ForgotPasswordForm />)
    emailInput = screen.getByRole('textbox', { name: /^Email$/i })
    submitButton = screen.getByRole('button', { name: /Send reset link/i })
  })

  it('renders email field and submit button', async () => {
    await expect.element(emailInput).toBeInTheDocument()
    await expect.element(submitButton).toBeInTheDocument()
  })

  it('shows validation when submitting empty form', async () => {
    await userEvent.click(submitButton)
    await expect
      .element(screen.getByText(/^Please enter your email\.$/i))
      .toBeInTheDocument()
  })

  it('calls sendPasswordReset and resets the form on success', async () => {
    await userEvent.fill(emailInput, 'a@b.com')
    await userEvent.click(submitButton)

    await vi.waitFor(() =>
      expect(sendPasswordResetMock).toHaveBeenCalledWith('a@b.com')
    )

    // Form should reset on success
    await expect.element(emailInput).toHaveValue('')
  })

  it('exposes the auth store mock', () => {
    // Smoke check that the mocked store import still works.
    expect(useAuthStore.getState().sendPasswordReset).toBe(
      sendPasswordResetMock
    )
  })
})
