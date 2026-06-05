import { Toaster, toast } from 'sonner'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render } from 'vitest-browser-react'
import { userEvent } from 'vitest/browser'
import { UserAuthForm } from './user-auth-form'

const toastErrorSpy = vi.spyOn(toast, 'error')

const signInWithPassword = vi.fn()
const signInWithGoogle = vi.fn()
const navigate = vi.fn()

vi.mock('@/stores/auth-store', () => {
  const state = () => ({
    signInWithPassword,
    signInWithGoogle,
  })
  return {
    useAuthStore: Object.assign(state, { getState: state }),
  }
})

vi.mock('@tanstack/react-router', async (orig) => {
  const actual = await orig<typeof import('@tanstack/react-router')>()
  return {
    ...actual,
    useNavigate: () => navigate,
    Link: ({
      children,
      to,
      className,
      ...rest
    }: {
      children?: React.ReactNode
      to: string
      className?: string
    }) => (
      <a href={to} className={className} {...rest}>
        {children}
      </a>
    ),
  }
})

async function setup(redirectTo?: string) {
  return await render(
    <>
      <Toaster />
      <UserAuthForm redirectTo={redirectTo} />
    </>
  )
}

describe('UserAuthForm', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('successful login navigates to redirect target', async () => {
    signInWithPassword.mockResolvedValue({ error: null })
    const screen = await setup('/users')

    await userEvent.fill(
      screen.getByRole('textbox', { name: /^Email$/i }),
      'me@gmail.com'
    )
    await userEvent.fill(screen.getByLabelText(/^Password$/i), 'secret123')
    await userEvent.click(screen.getByRole('button', { name: /^Sign in$/i }))

    await vi.waitFor(() =>
      expect(navigate).toHaveBeenCalledWith({ to: '/users', replace: true })
    )
  })

  it('Supabase error shows generic toast', async () => {
    signInWithPassword.mockResolvedValue({
      error: { message: 'Invalid login credentials' },
    })
    const screen = await setup()

    await userEvent.fill(
      screen.getByRole('textbox', { name: /^Email$/i }),
      'me@tokatek.com'
    )
    await userEvent.fill(screen.getByLabelText(/^Password$/i), 'wrongpw1')
    await userEvent.click(screen.getByRole('button', { name: /^Sign in$/i }))

    await vi.waitFor(() =>
      expect(toastErrorSpy).toHaveBeenCalledWith(
        expect.stringMatching(/email hoặc mật khẩu không đúng/i)
      )
    )
  })

  it('Google button calls signInWithGoogle with redirect', async () => {
    signInWithGoogle.mockResolvedValue({ error: null })
    const screen = await setup('/tasks')

    await userEvent.click(screen.getByRole('button', { name: /google/i }))

    await vi.waitFor(() =>
      expect(signInWithGoogle).toHaveBeenCalledWith('/tasks')
    )
  })
})
