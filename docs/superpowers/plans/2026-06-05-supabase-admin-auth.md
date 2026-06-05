# Supabase Admin Auth Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace mock auth in `toka-shadcn-admin` with real Supabase authentication (email+password, Google OAuth, forgot-password), gated to `@tokatek.com` users, and remove Clerk entirely.

**Architecture:** Single `supabase` client singleton; Zustand `auth-store` wraps `supabase.auth` and exposes session/status/actions via `onAuthStateChange`. TanStack Router `beforeLoad` guard on `_authenticated` redirects to `/sign-in?redirect=…` for non-allowed sessions. New `/oauth/callback` and `/reset-password` routes complete OAuth and recovery flows.

**Tech Stack:** Vite, React 19, TypeScript, TanStack Router (file-based), Zustand, `@supabase/supabase-js`, vitest + `@vitest/browser-playwright`, react-hook-form + zod.

**Spec:** `docs/superpowers/specs/2026-06-05-supabase-admin-auth-design.md`

---

## File Structure

**New:**
- `src/lib/supabase.ts` — singleton browser client
- `src/routes/(auth)/oauth.callback.tsx` — completes OAuth, redirects
- `src/routes/(auth)/reset-password.tsx` — recovery-token landing + new password form
- `src/features/auth/reset-password/index.tsx`
- `src/features/auth/reset-password/components/reset-password-form.tsx`

**Rewritten:**
- `src/stores/auth-store.ts` — wraps Supabase
- `src/stores/auth-store.test.ts` — new contract
- `src/features/auth/sign-in/components/user-auth-form.tsx` — real signIn + Google
- `src/features/auth/forgot-password/components/forgot-password-form.tsx` — wire to Supabase
- `src/features/auth/sign-in/index.tsx` — remove sign-up link
- `src/features/auth/forgot-password/index.tsx` — remove sign-up link

**Modified:**
- `src/routes/_authenticated/route.tsx` — add `beforeLoad` guard
- `src/main.tsx` — update axios 401 path to call new `signOut()`
- `.env.example` — replace `VITE_CLERK_PUBLISHABLE_KEY` with Supabase vars
- `package.json` (via pnpm CLI) — remove `@clerk/react`, add `@supabase/supabase-js`
- `README.md` — Supabase + Google Cloud setup checklist

**Deleted:**
- `src/routes/clerk/` (entire subtree)
- `src/routes/(auth)/sign-up.tsx`
- `src/routes/(auth)/otp.tsx`
- `src/routes/(auth)/sign-in-2.tsx`
- `src/features/auth/sign-up/`
- `src/features/auth/otp/`
- `src/features/auth/sign-in/sign-in-2.tsx`

---

## Task 1: Install Supabase, remove Clerk, add env vars

**Files:**
- Modify: `package.json` (via pnpm)
- Modify: `.env.example`

- [ ] **Step 1: Install Supabase JS, uninstall Clerk**

Run:
```bash
pnpm add @supabase/supabase-js
pnpm remove @clerk/react
```

- [ ] **Step 2: Update `.env.example`**

Replace file contents with:
```
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
```

- [ ] **Step 3: Create local `.env.local` placeholder (do not commit)**

```bash
[ -f .env.local ] || cp .env.example .env.local
```

Manually fill `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` from Supabase Dashboard → Settings → API.

- [ ] **Step 4: Commit**

```bash
git add package.json pnpm-lock.yaml .env.example
git commit -m "chore(auth): swap @clerk/react for @supabase/supabase-js"
```

---

## Task 2: Create Supabase client singleton

**Files:**
- Create: `src/lib/supabase.ts`
- Test: `src/lib/supabase.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/supabase.test.ts`:
```ts
import { describe, it, expect, vi } from 'vitest'

vi.stubEnv('VITE_SUPABASE_URL', 'https://example.supabase.co')
vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'anon-key')

describe('supabase client', () => {
  it('exports a client with auth namespace', async () => {
    const { supabase } = await import('./supabase')
    expect(supabase).toBeTruthy()
    expect(typeof supabase.auth.getSession).toBe('function')
    expect(typeof supabase.auth.onAuthStateChange).toBe('function')
  })

  it('isAllowedEmail returns true for @tokatek.com only', async () => {
    const { isAllowedEmail } = await import('./supabase')
    expect(isAllowedEmail('a@tokatek.com')).toBe(true)
    expect(isAllowedEmail('A@TOKATEK.COM')).toBe(true)
    expect(isAllowedEmail('a@gmail.com')).toBe(false)
    expect(isAllowedEmail(null)).toBe(false)
    expect(isAllowedEmail(undefined)).toBe(false)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test src/lib/supabase.test.ts`
Expected: FAIL — `Cannot find module './supabase'`

- [ ] **Step 3: Implement the client**

Create `src/lib/supabase.ts`:
```ts
import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!url || !anonKey) {
  throw new Error(
    'Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY. Copy .env.example to .env.local and fill in values from the Supabase Dashboard.'
  )
}

export const supabase = createClient(url, anonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    flowType: 'pkce',
  },
})

export const ALLOWED_EMAIL_DOMAIN = '@tokatek.com'

export function isAllowedEmail(email: string | undefined | null): boolean {
  return !!email && email.toLowerCase().endsWith(ALLOWED_EMAIL_DOMAIN)
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test src/lib/supabase.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/supabase.ts src/lib/supabase.test.ts
git commit -m "feat(auth): add supabase client singleton + email domain guard"
```

---

## Task 3: Rewrite auth-store as Supabase wrapper

**Files:**
- Modify: `src/stores/auth-store.ts` (full rewrite)
- Modify: `src/stores/auth-store.test.ts` (full rewrite)

- [ ] **Step 1: Write the failing tests**

Replace `src/stores/auth-store.test.ts`:
```ts
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Session, User } from '@supabase/supabase-js'

const onAuthStateChange = vi.fn()
const getSession = vi.fn()
const signInWithPassword = vi.fn()
const signInWithOAuth = vi.fn()
const signOut = vi.fn()
const resetPasswordForEmail = vi.fn()
const updateUser = vi.fn()

vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      onAuthStateChange,
      getSession,
      signInWithPassword,
      signInWithOAuth,
      signOut,
      resetPasswordForEmail,
      updateUser,
    },
  },
  isAllowedEmail: (email?: string | null) =>
    !!email && email.toLowerCase().endsWith('@tokatek.com'),
  ALLOWED_EMAIL_DOMAIN: '@tokatek.com',
}))

function makeSession(email: string): Session {
  return {
    access_token: 'a',
    refresh_token: 'r',
    expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    token_type: 'bearer',
    user: { id: 'u1', email } as User,
  } as Session
}

async function freshStore() {
  vi.resetModules()
  const mod = await import('./auth-store')
  return mod.useAuthStore
}

describe('useAuthStore', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getSession.mockResolvedValue({ data: { session: null }, error: null })
    onAuthStateChange.mockReturnValue({
      data: { subscription: { unsubscribe: vi.fn() } },
    })
  })

  it('starts in loading status, then resolves to unauthenticated', async () => {
    const useAuthStore = await freshStore()
    expect(useAuthStore.getState().status).toBe('loading')
    await vi.waitFor(() =>
      expect(useAuthStore.getState().status).toBe('unauthenticated')
    )
  })

  it('initial getSession with @tokatek.com session sets authenticated + allowed', async () => {
    const session = makeSession('user@tokatek.com')
    getSession.mockResolvedValue({ data: { session }, error: null })
    const useAuthStore = await freshStore()
    await vi.waitFor(() =>
      expect(useAuthStore.getState().status).toBe('authenticated')
    )
    expect(useAuthStore.getState().isAllowed()).toBe(true)
    expect(useAuthStore.getState().user?.email).toBe('user@tokatek.com')
  })

  it('isAllowed false for non-tokatek email', async () => {
    const session = makeSession('user@gmail.com')
    getSession.mockResolvedValue({ data: { session }, error: null })
    const useAuthStore = await freshStore()
    await vi.waitFor(() =>
      expect(useAuthStore.getState().status).toBe('authenticated')
    )
    expect(useAuthStore.getState().isAllowed()).toBe(false)
  })

  it('signInWithPassword forwards to supabase and returns its error', async () => {
    signInWithPassword.mockResolvedValue({
      data: { session: null, user: null },
      error: { message: 'Invalid login credentials' },
    })
    const useAuthStore = await freshStore()
    const result = await useAuthStore
      .getState()
      .signInWithPassword('a@tokatek.com', 'pw')
    expect(signInWithPassword).toHaveBeenCalledWith({
      email: 'a@tokatek.com',
      password: 'pw',
    })
    expect(result.error?.message).toBe('Invalid login credentials')
  })

  it('signInWithGoogle calls signInWithOAuth with provider and redirect', async () => {
    signInWithOAuth.mockResolvedValue({ data: {}, error: null })
    const useAuthStore = await freshStore()
    await useAuthStore.getState().signInWithGoogle('/users')
    expect(signInWithOAuth).toHaveBeenCalledWith({
      provider: 'google',
      options: {
        redirectTo: expect.stringContaining('/oauth/callback?redirect=%2Fusers'),
      },
    })
  })

  it('signOut clears local session', async () => {
    const session = makeSession('user@tokatek.com')
    getSession.mockResolvedValue({ data: { session }, error: null })
    signOut.mockResolvedValue({ error: null })
    const useAuthStore = await freshStore()
    await vi.waitFor(() =>
      expect(useAuthStore.getState().status).toBe('authenticated')
    )
    await useAuthStore.getState().signOut()
    expect(signOut).toHaveBeenCalled()
    expect(useAuthStore.getState().session).toBeNull()
    expect(useAuthStore.getState().user).toBeNull()
    expect(useAuthStore.getState().status).toBe('unauthenticated')
  })

  it('onAuthStateChange handler updates state on SIGNED_IN', async () => {
    const useAuthStore = await freshStore()
    await vi.waitFor(() =>
      expect(useAuthStore.getState().status).toBe('unauthenticated')
    )
    const handler = onAuthStateChange.mock.calls[0][0]
    const session = makeSession('me@tokatek.com')
    handler('SIGNED_IN', session)
    expect(useAuthStore.getState().status).toBe('authenticated')
    expect(useAuthStore.getState().user?.email).toBe('me@tokatek.com')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test src/stores/auth-store.test.ts`
Expected: FAIL — store shape doesn't match.

- [ ] **Step 3: Rewrite the store**

Replace `src/stores/auth-store.ts`:
```ts
import { create } from 'zustand'
import type { AuthError, Session, User } from '@supabase/supabase-js'
import { supabase, isAllowedEmail } from '@/lib/supabase'

type Status = 'loading' | 'authenticated' | 'unauthenticated'

interface AuthState {
  session: Session | null
  user: User | null
  status: Status
  signInWithPassword: (
    email: string,
    password: string
  ) => Promise<{ error: AuthError | null }>
  signInWithGoogle: (
    redirectPath?: string
  ) => Promise<{ error: AuthError | null }>
  signOut: () => Promise<void>
  sendPasswordReset: (email: string) => Promise<{ error: AuthError | null }>
  updatePassword: (newPassword: string) => Promise<{ error: AuthError | null }>
  isAllowed: () => boolean
}

function applySession(
  set: (partial: Partial<AuthState>) => void,
  session: Session | null
) {
  set({
    session,
    user: session?.user ?? null,
    status: session ? 'authenticated' : 'unauthenticated',
  })
}

export const useAuthStore = create<AuthState>()((set, get) => {
  // Hydrate from existing session, then subscribe to changes.
  void supabase.auth.getSession().then(({ data }) => {
    applySession(set, data.session)
  })

  supabase.auth.onAuthStateChange((_event, session) => {
    applySession(set, session)
  })

  return {
    session: null,
    user: null,
    status: 'loading',

    async signInWithPassword(email, password) {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      })
      return { error }
    },

    async signInWithGoogle(redirectPath) {
      const callback = new URL('/oauth/callback', window.location.origin)
      if (redirectPath) callback.searchParams.set('redirect', redirectPath)
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: callback.toString() },
      })
      return { error }
    },

    async signOut() {
      await supabase.auth.signOut()
      applySession(set, null)
    },

    async sendPasswordReset(email) {
      const redirectTo = `${window.location.origin}/reset-password`
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo,
      })
      return { error }
    },

    async updatePassword(newPassword) {
      const { error } = await supabase.auth.updateUser({
        password: newPassword,
      })
      return { error }
    },

    isAllowed() {
      const s = get()
      return s.status === 'authenticated' && isAllowedEmail(s.user?.email)
    },
  }
})
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test src/stores/auth-store.test.ts`
Expected: PASS (all 7 tests)

- [ ] **Step 5: Commit**

```bash
git add src/stores/auth-store.ts src/stores/auth-store.test.ts
git commit -m "feat(auth): rewrite auth-store as supabase session wrapper"
```

---

## Task 4: Update axios 401 handler in main.tsx

**Files:**
- Modify: `src/main.tsx`

- [ ] **Step 1: Patch the 401 path**

In `src/main.tsx`, replace the 401 block inside the `queryCache.onError` handler:

Old:
```ts
if (error.response?.status === 401) {
  toast.error('Session expired!')
  useAuthStore.getState().auth.reset()
  const redirect = `${router.history.location.href}`
  router.navigate({ to: '/sign-in', search: { redirect } })
}
```

New:
```ts
if (error.response?.status === 401) {
  toast.error('Session expired!')
  void useAuthStore.getState().signOut()
  const redirect = `${router.history.location.href}`
  router.navigate({ to: '/sign-in', search: { redirect } })
}
```

- [ ] **Step 2: Run typecheck**

Run: `pnpm build`
Expected: build succeeds (no TS errors).

- [ ] **Step 3: Commit**

```bash
git add src/main.tsx
git commit -m "fix(auth): call supabase signOut on 401 instead of mock reset"
```

---

## Task 5: Rewrite sign-in form with Supabase + Google + domain check

**Files:**
- Modify: `src/features/auth/sign-in/components/user-auth-form.tsx`
- Test: `src/features/auth/sign-in/components/user-auth-form.test.tsx` (new)

- [ ] **Step 1: Write the failing tests**

Create `src/features/auth/sign-in/components/user-auth-form.test.tsx`:
```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { Toaster } from 'sonner'

let currentEmail = ''
const signInWithPassword = vi.fn()
const signInWithGoogle = vi.fn()
const signOut = vi.fn()
const navigate = vi.fn()

vi.mock('@/stores/auth-store', () => {
  const state = () => ({
    signInWithPassword,
    signInWithGoogle,
    signOut,
    user: { email: currentEmail },
    isAllowed: () =>
      !!currentEmail && currentEmail.toLowerCase().endsWith('@tokatek.com'),
  })
  return {
    useAuthStore: Object.assign(state, { getState: state }),
  }
})

vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => navigate,
  Link: ({ children, ...p }: any) => <a {...p}>{children}</a>,
}))

import { UserAuthForm } from './user-auth-form'

function setup(redirectTo?: string) {
  return render(
    <>
      <Toaster />
      <UserAuthForm redirectTo={redirectTo} />
    </>
  )
}

describe('UserAuthForm', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    currentEmail = ''
  })

  it('@tokatek.com login navigates to redirect target', async () => {
    currentEmail = 'me@tokatek.com'
    signInWithPassword.mockResolvedValue({ error: null })
    setup('/users')
    fireEvent.change(screen.getByLabelText(/email/i), {
      target: { value: 'me@tokatek.com' },
    })
    fireEvent.change(screen.getByLabelText(/password/i), {
      target: { value: 'secret123' },
    })
    fireEvent.click(screen.getByRole('button', { name: /sign in/i }))
    await waitFor(() =>
      expect(navigate).toHaveBeenCalledWith({ to: '/users', replace: true })
    )
    expect(signOut).not.toHaveBeenCalled()
  })

  it('non-tokatek login is signed out + toast shown', async () => {
    currentEmail = 'me@gmail.com'
    signInWithPassword.mockResolvedValue({ error: null })
    setup()
    fireEvent.change(screen.getByLabelText(/email/i), {
      target: { value: 'me@gmail.com' },
    })
    fireEvent.change(screen.getByLabelText(/password/i), {
      target: { value: 'secret123' },
    })
    fireEvent.click(screen.getByRole('button', { name: /sign in/i }))
    await waitFor(() => expect(signOut).toHaveBeenCalled())
    expect(navigate).not.toHaveBeenCalled()
  })

  it('Supabase error shows generic toast', async () => {
    signInWithPassword.mockResolvedValue({
      error: { message: 'Invalid login credentials' },
    })
    setup()
    fireEvent.change(screen.getByLabelText(/email/i), {
      target: { value: 'me@tokatek.com' },
    })
    fireEvent.change(screen.getByLabelText(/password/i), {
      target: { value: 'wrong' },
    })
    fireEvent.click(screen.getByRole('button', { name: /sign in/i }))
    await waitFor(() =>
      expect(
        screen.getByText(/email hoặc mật khẩu không đúng/i)
      ).toBeInTheDocument()
    )
  })

  it('Google button calls signInWithGoogle with redirect', async () => {
    signInWithGoogle.mockResolvedValue({ error: null })
    setup('/tasks')
    fireEvent.click(screen.getByRole('button', { name: /google/i }))
    await waitFor(() =>
      expect(signInWithGoogle).toHaveBeenCalledWith('/tasks')
    )
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test src/features/auth/sign-in/components/user-auth-form.test.tsx`
Expected: FAIL — current form uses mock store shape.

- [ ] **Step 3: Rewrite the form**

Replace `src/features/auth/sign-in/components/user-auth-form.tsx`:
```tsx
import { useState } from 'react'
import { z } from 'zod'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Link, useNavigate } from '@tanstack/react-router'
import { Loader2, LogIn } from 'lucide-react'
import { toast } from 'sonner'
import { useAuthStore } from '@/stores/auth-store'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { PasswordInput } from '@/components/password-input'

const formSchema = z.object({
  email: z.email({
    error: (iss) => (iss.input === '' ? 'Please enter your email.' : undefined),
  }),
  password: z
    .string()
    .min(1, 'Please enter your password.')
    .min(7, 'Password must be at least 7 characters long.'),
})

interface UserAuthFormProps extends React.HTMLAttributes<HTMLFormElement> {
  redirectTo?: string
}

export function UserAuthForm({
  className,
  redirectTo,
  ...props
}: UserAuthFormProps) {
  const [isLoading, setIsLoading] = useState(false)
  const [isGoogleLoading, setIsGoogleLoading] = useState(false)
  const navigate = useNavigate()

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: { email: '', password: '' },
  })

  async function onSubmit(data: z.infer<typeof formSchema>) {
    setIsLoading(true)
    const { signInWithPassword } = useAuthStore.getState()
    const { error } = await signInWithPassword(data.email, data.password)
    setIsLoading(false)

    if (error) {
      toast.error('Email hoặc mật khẩu không đúng')
      return
    }

    const { isAllowed, signOut } = useAuthStore.getState()
    if (!isAllowed()) {
      await signOut()
      toast.error('Tài khoản không có quyền truy cập')
      return
    }

    navigate({ to: redirectTo || '/', replace: true })
  }

  async function onGoogle() {
    setIsGoogleLoading(true)
    const { signInWithGoogle } = useAuthStore.getState()
    const { error } = await signInWithGoogle(redirectTo)
    if (error) {
      setIsGoogleLoading(false)
      toast.error('Không kết nối được Google, thử lại sau')
    }
    // On success Supabase redirects away; no local navigate.
  }

  const busy = isLoading || isGoogleLoading

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit(onSubmit)}
        className={cn('grid gap-3', className)}
        {...props}
      >
        <FormField
          control={form.control}
          name='email'
          render={({ field }) => (
            <FormItem>
              <FormLabel>Email</FormLabel>
              <FormControl>
                <Input
                  placeholder='name@tokatek.com'
                  autoComplete='email'
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name='password'
          render={({ field }) => (
            <FormItem className='relative'>
              <FormLabel>Password</FormLabel>
              <FormControl>
                <PasswordInput
                  placeholder='********'
                  autoComplete='current-password'
                  {...field}
                />
              </FormControl>
              <FormMessage />
              <Link
                to='/forgot-password'
                className='absolute inset-e-0 -top-0.5 text-sm font-medium text-muted-foreground hover:opacity-75'
              >
                Forgot password?
              </Link>
            </FormItem>
          )}
        />
        <Button className='mt-2' disabled={busy} type='submit'>
          {isLoading ? <Loader2 className='animate-spin' /> : <LogIn />}
          Sign in
        </Button>

        <div className='relative my-2'>
          <div className='absolute inset-0 flex items-center'>
            <span className='w-full border-t' />
          </div>
          <div className='relative flex justify-center text-xs uppercase'>
            <span className='bg-background px-2 text-muted-foreground'>
              Or continue with
            </span>
          </div>
        </div>

        <Button
          variant='outline'
          type='button'
          disabled={busy}
          onClick={onGoogle}
        >
          {isGoogleLoading ? <Loader2 className='animate-spin' /> : null}
          Continue with Google
        </Button>
      </form>
    </Form>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test src/features/auth/sign-in/components/user-auth-form.test.tsx`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/features/auth/sign-in/components/user-auth-form.tsx \
        src/features/auth/sign-in/components/user-auth-form.test.tsx
git commit -m "feat(auth): wire sign-in form to supabase + google + domain check"
```

---

## Task 6: Add `beforeLoad` guard to `_authenticated` route

**Files:**
- Modify: `src/routes/_authenticated/route.tsx`

- [ ] **Step 1: Rewrite the route**

Replace `src/routes/_authenticated/route.tsx`:
```tsx
import { createFileRoute, redirect } from '@tanstack/react-router'
import { AuthenticatedLayout } from '@/components/layout/authenticated-layout'
import { useAuthStore } from '@/stores/auth-store'

export const Route = createFileRoute('/_authenticated')({
  beforeLoad: async ({ location }) => {
    // Wait for store hydration if still loading.
    if (useAuthStore.getState().status === 'loading') {
      await new Promise<void>((resolvePromise) => {
        const unsub = useAuthStore.subscribe((s) => {
          if (s.status !== 'loading') {
            unsub()
            resolvePromise()
          }
        })
      })
    }
    if (!useAuthStore.getState().isAllowed()) {
      throw redirect({
        to: '/sign-in',
        search: { redirect: location.href },
      })
    }
  },
  component: AuthenticatedLayout,
})
```

- [ ] **Step 2: Run build to typecheck**

Run: `pnpm build`
Expected: build succeeds.

- [ ] **Step 3: Commit**

```bash
git add src/routes/_authenticated/route.tsx
git commit -m "feat(auth): gate _authenticated routes by supabase session + domain"
```

---

## Task 7: Add OAuth callback route

**Files:**
- Create: `src/routes/(auth)/oauth.callback.tsx`

- [ ] **Step 1: Implement the route**

Create `src/routes/(auth)/oauth.callback.tsx`:
```tsx
import { useEffect } from 'react'
import { z } from 'zod'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { useAuthStore } from '@/stores/auth-store'

const searchSchema = z.object({
  redirect: z.string().optional(),
  error_description: z.string().optional(),
})

function OAuthCallback() {
  const navigate = useNavigate()
  const { redirect, error_description } = Route.useSearch()

  useEffect(() => {
    if (error_description) {
      toast.error(error_description)
      navigate({ to: '/sign-in', replace: true })
      return
    }
    const unsub = useAuthStore.subscribe(async (s) => {
      if (s.status === 'loading') return
      if (s.isAllowed()) {
        unsub()
        navigate({ to: redirect || '/', replace: true })
      } else if (s.status === 'authenticated') {
        unsub()
        await s.signOut()
        toast.error('Tài khoản không có quyền truy cập')
        navigate({ to: '/sign-in', replace: true })
      } else {
        unsub()
        navigate({ to: '/sign-in', replace: true })
      }
    })
    return () => unsub()
  }, [navigate, redirect, error_description])

  return (
    <div className='flex h-screen items-center justify-center gap-2 text-muted-foreground'>
      <Loader2 className='h-5 w-5 animate-spin' />
      <span>Signing you in…</span>
    </div>
  )
}

export const Route = createFileRoute('/(auth)/oauth/callback')({
  component: OAuthCallback,
  validateSearch: searchSchema,
})
```

> Note: file path uses dot syntax `oauth.callback.tsx` which TanStack Router compiles to nested path `/oauth/callback`. The `routeTree.gen.ts` regenerates on `pnpm dev` / `pnpm build`.

- [ ] **Step 2: Regenerate route tree and typecheck**

Run: `pnpm build`
Expected: build succeeds (routeTree.gen.ts updated automatically).

- [ ] **Step 3: Commit**

```bash
git add "src/routes/(auth)/oauth.callback.tsx" src/routeTree.gen.ts
git commit -m "feat(auth): add /oauth/callback route for google sign-in"
```

---

## Task 8: Wire forgot-password to Supabase

**Files:**
- Modify: `src/features/auth/forgot-password/components/forgot-password-form.tsx`
- Modify: `src/features/auth/forgot-password/index.tsx` (remove sign-up link)

- [ ] **Step 1: Inspect current form**

Run: `cat src/features/auth/forgot-password/components/forgot-password-form.tsx`

(Note current shape so the replacement preserves the existing UI structure.)

- [ ] **Step 2: Replace the form**

Overwrite `src/features/auth/forgot-password/components/forgot-password-form.tsx`:
```tsx
import { useState } from 'react'
import { z } from 'zod'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { useAuthStore } from '@/stores/auth-store'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'

const formSchema = z.object({
  email: z.email({
    error: (iss) => (iss.input === '' ? 'Please enter your email.' : undefined),
  }),
})

export function ForgotPasswordForm({
  className,
  ...props
}: React.HTMLAttributes<HTMLFormElement>) {
  const [isLoading, setIsLoading] = useState(false)
  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: { email: '' },
  })

  async function onSubmit(data: z.infer<typeof formSchema>) {
    setIsLoading(true)
    await useAuthStore.getState().sendPasswordReset(data.email)
    setIsLoading(false)
    // Generic message regardless of result (no user enumeration).
    toast.success('Nếu email tồn tại, link đã được gửi')
    form.reset()
  }

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit(onSubmit)}
        className={cn('grid gap-3', className)}
        {...props}
      >
        <FormField
          control={form.control}
          name='email'
          render={({ field }) => (
            <FormItem>
              <FormLabel>Email</FormLabel>
              <FormControl>
                <Input
                  placeholder='name@tokatek.com'
                  autoComplete='email'
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <Button className='mt-2' disabled={isLoading} type='submit'>
          {isLoading ? <Loader2 className='animate-spin' /> : null}
          Send reset link
        </Button>
      </form>
    </Form>
  )
}
```

- [ ] **Step 3: Remove sign-up footer link**

Replace `src/features/auth/forgot-password/index.tsx`:
```tsx
import { Link } from '@tanstack/react-router'
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { AuthLayout } from '../auth-layout'
import { ForgotPasswordForm } from './components/forgot-password-form'

export function ForgotPassword() {
  return (
    <AuthLayout>
      <Card className='max-w-sm gap-4 sm:min-w-sm'>
        <CardHeader>
          <CardTitle className='text-lg tracking-tight'>
            Forgot Password
          </CardTitle>
          <CardDescription>
            Enter your registered email and we will send you a link to reset
            your password.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ForgotPasswordForm />
        </CardContent>
        <CardFooter>
          <p className='mx-auto px-8 text-center text-sm text-balance text-muted-foreground'>
            Remember your password?{' '}
            <Link
              to='/sign-in'
              className='underline underline-offset-4 hover:text-primary'
            >
              Sign in
            </Link>
            .
          </p>
        </CardFooter>
      </Card>
    </AuthLayout>
  )
}
```

- [ ] **Step 4: Build**

Run: `pnpm build`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/auth/forgot-password/
git commit -m "feat(auth): wire forgot-password to supabase resetPasswordForEmail"
```

---

## Task 9: Add reset-password page + route

**Files:**
- Create: `src/features/auth/reset-password/index.tsx`
- Create: `src/features/auth/reset-password/components/reset-password-form.tsx`
- Create: `src/routes/(auth)/reset-password.tsx`

- [ ] **Step 1: Create the form component**

Create `src/features/auth/reset-password/components/reset-password-form.tsx`:
```tsx
import { useState } from 'react'
import { z } from 'zod'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useNavigate } from '@tanstack/react-router'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { useAuthStore } from '@/stores/auth-store'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { PasswordInput } from '@/components/password-input'

const formSchema = z
  .object({
    password: z.string().min(8, 'Password must be at least 8 characters'),
    confirm: z.string().min(1, 'Please confirm your password'),
  })
  .refine((d) => d.password === d.confirm, {
    message: 'Passwords do not match',
    path: ['confirm'],
  })

export function ResetPasswordForm({
  className,
  ...props
}: React.HTMLAttributes<HTMLFormElement>) {
  const [isLoading, setIsLoading] = useState(false)
  const navigate = useNavigate()
  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: { password: '', confirm: '' },
  })

  async function onSubmit(data: z.infer<typeof formSchema>) {
    setIsLoading(true)
    const { updatePassword, signOut } = useAuthStore.getState()
    const { error } = await updatePassword(data.password)
    setIsLoading(false)
    if (error) {
      toast.error('Không đặt lại được mật khẩu. Link có thể đã hết hạn.')
      return
    }
    await signOut()
    toast.success('Mật khẩu đã được cập nhật. Vui lòng đăng nhập lại.')
    navigate({ to: '/sign-in', replace: true })
  }

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit(onSubmit)}
        className={cn('grid gap-3', className)}
        {...props}
      >
        <FormField
          control={form.control}
          name='password'
          render={({ field }) => (
            <FormItem>
              <FormLabel>New password</FormLabel>
              <FormControl>
                <PasswordInput
                  autoComplete='new-password'
                  placeholder='********'
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name='confirm'
          render={({ field }) => (
            <FormItem>
              <FormLabel>Confirm password</FormLabel>
              <FormControl>
                <PasswordInput
                  autoComplete='new-password'
                  placeholder='********'
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <Button className='mt-2' disabled={isLoading} type='submit'>
          {isLoading ? <Loader2 className='animate-spin' /> : null}
          Update password
        </Button>
      </form>
    </Form>
  )
}
```

- [ ] **Step 2: Create the page component**

Create `src/features/auth/reset-password/index.tsx`:
```tsx
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { AuthLayout } from '../auth-layout'
import { ResetPasswordForm } from './components/reset-password-form'

export function ResetPassword() {
  return (
    <AuthLayout>
      <Card className='max-w-sm gap-4 sm:min-w-sm'>
        <CardHeader>
          <CardTitle className='text-lg tracking-tight'>
            Reset Password
          </CardTitle>
          <CardDescription>
            Enter a new password for your account.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ResetPasswordForm />
        </CardContent>
      </Card>
    </AuthLayout>
  )
}
```

- [ ] **Step 3: Create the route**

Create `src/routes/(auth)/reset-password.tsx`:
```tsx
import { createFileRoute } from '@tanstack/react-router'
import { ResetPassword } from '@/features/auth/reset-password'

export const Route = createFileRoute('/(auth)/reset-password')({
  component: ResetPassword,
})
```

- [ ] **Step 4: Build**

Run: `pnpm build`
Expected: PASS — routeTree.gen.ts updates.

- [ ] **Step 5: Commit**

```bash
git add src/features/auth/reset-password/ "src/routes/(auth)/reset-password.tsx" src/routeTree.gen.ts
git commit -m "feat(auth): add /reset-password page for supabase recovery flow"
```

---

## Task 10: Remove sign-up link from sign-in page

**Files:**
- Modify: `src/features/auth/sign-in/index.tsx`

- [ ] **Step 1: Replace file**

Overwrite `src/features/auth/sign-in/index.tsx`:
```tsx
import { useSearch } from '@tanstack/react-router'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { AuthLayout } from '../auth-layout'
import { UserAuthForm } from './components/user-auth-form'

export function SignIn() {
  const { redirect } = useSearch({ from: '/(auth)/sign-in' })

  return (
    <AuthLayout>
      <Card className='max-w-sm gap-4'>
        <CardHeader>
          <CardTitle className='text-lg tracking-tight'>Sign in</CardTitle>
          <CardDescription>
            Enter your email and password below to log into your account.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <UserAuthForm redirectTo={redirect} />
        </CardContent>
      </Card>
    </AuthLayout>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/features/auth/sign-in/index.tsx
git commit -m "chore(auth): drop sign-up footer link from sign-in page"
```

---

## Task 11: Delete sign-up, OTP, sign-in-2, and Clerk subtree

**Files:**
- Delete: `src/routes/(auth)/sign-up.tsx`
- Delete: `src/routes/(auth)/otp.tsx`
- Delete: `src/routes/(auth)/sign-in-2.tsx`
- Delete: `src/features/auth/sign-up/` (entire folder)
- Delete: `src/features/auth/otp/` (entire folder)
- Delete: `src/features/auth/sign-in/sign-in-2.tsx`
- Delete: `src/routes/clerk/` (entire subtree)

- [ ] **Step 1: Remove the files**

```bash
git rm "src/routes/(auth)/sign-up.tsx" \
       "src/routes/(auth)/otp.tsx" \
       "src/routes/(auth)/sign-in-2.tsx"
git rm -r src/features/auth/sign-up src/features/auth/otp
git rm src/features/auth/sign-in/sign-in-2.tsx
git rm -r src/routes/clerk
```

- [ ] **Step 2: Find and remove residual `@clerk` imports**

Run:
```bash
grep -rn "@clerk" src
```

If any matches, edit each to remove the import and any Clerk-specific JSX, replacing with the Supabase equivalents already added in earlier tasks. If a file has nothing left to render, delete it.

- [ ] **Step 3: Find and remove residual links/references**

Run:
```bash
grep -rn "/sign-up\|/clerk\|/otp" src
```

For each match, either:
- Update the link target to `/sign-in` (if it was a fallback like "back to sign in"), or
- Remove the element entirely (sign-up CTAs in marketing-style copy).

- [ ] **Step 4: Build**

Run: `pnpm build`
Expected: PASS. The route tree regenerates without the deleted paths.

If build fails referencing a deleted route in `routeTree.gen.ts`, delete that file and rerun `pnpm build` — the plugin will regenerate it.

- [ ] **Step 5: Lint**

Run: `pnpm lint`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "chore(auth): remove sign-up, OTP, sign-in-2, and clerk routes"
```

---

## Task 12: Audit sidebar/nav for Clerk links

**Files:**
- Modify: any file in `src/components/layout/` or `src/components/` that links to clerk routes (discovered dynamically).

- [ ] **Step 1: Search nav components**

Run:
```bash
grep -rn "clerk\|UserButton" src/components src/features
```

- [ ] **Step 2: Remove or replace each reference**

For each hit:
- If it's a `<UserButton>` from Clerk: replace with the existing app `UserNav` (already in `src/components/layout/`).
- If it's a `to="/clerk/..."` link: change to its non-clerk equivalent (e.g. `/users`, `/settings`) or delete the menu item.

- [ ] **Step 3: Build + lint**

Run: `pnpm build && pnpm lint`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "chore(auth): scrub clerk references from layout/nav"
```

---

## Task 13: Update README with Supabase + Google setup checklist

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Append setup section**

Add a new section to `README.md` (near top, before "Customized Components" or wherever environment setup lives):

````markdown
## Authentication setup (Supabase)

This app uses Supabase for auth. Access is restricted to `@tokatek.com` accounts.

### 1. Env

Copy `.env.example` → `.env.local` and fill from Supabase Dashboard → Settings → API:

```
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
```

### 2. Supabase Dashboard — one-time

- **Auth → Providers → Email**: Enabled. "Confirm email" = ON.
- **Auth → Providers → Google**: Enabled. Paste Google OAuth client id/secret.
- **Auth → URL Configuration**:
  - Site URL: `http://localhost:5173` (dev) or production URL
  - Redirect URLs: `${SITE}/oauth/callback`, `${SITE}/reset-password`
- **Auth → Email Templates → Reset Password**: confirm the link points to `{{ .SiteURL }}/reset-password`.

### 3. Google Cloud Console — one-time

- OAuth consent screen: **Internal** under the tokatek Workspace.
- Authorized redirect URIs: `${SUPABASE_URL}/auth/v1/callback`.

### 4. Creating users (invite-only)

Dashboard → Authentication → Users → **Add user** → tick "Auto Confirm User". Send the new user to `/forgot-password` to set their own password.
````

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "docs(auth): document supabase + google oauth setup"
```

---

## Task 14: Final verification + cleanup

- [ ] **Step 1: Full lint + build + test**

Run:
```bash
pnpm lint && pnpm build && pnpm test
```

Expected: all green.

- [ ] **Step 2: Knip dead-code check**

Run: `pnpm knip`

Expected: no findings for removed Clerk/sign-up surfaces. If knip flags an unused export elsewhere, decide case-by-case (remove if truly orphaned).

- [ ] **Step 3: Smoke test (manual)**

1. `pnpm dev`
2. Visit `http://localhost:5173/users` while signed out → should redirect to `/sign-in?redirect=…`
3. Sign in with a seeded `@tokatek.com` test account → lands on the dashboard
4. Refresh browser → still signed in
5. Sign out via user-nav → back at `/sign-in`
6. Try `bad@gmail.com` (create via Dashboard for test) → form succeeds in Supabase but app toasts "không có quyền" and you stay on sign-in
7. Forgot-password → check inbox → reset link → set new password → can log in
8. Google button → consent screen → redirected to `/oauth/callback` → lands on dashboard

- [ ] **Step 4: Verify Clerk fully gone**

Run:
```bash
grep -rn "@clerk\|clerk" src
test -d src/routes/clerk && echo "FAIL: clerk dir still exists" || echo "ok"
grep -n "VITE_CLERK" .env.example && echo "FAIL: clerk env still listed" || echo "ok"
```

Expected: no Clerk hits in `src/`; "ok" / "ok" for the dir + env checks.

- [ ] **Step 5: Final commit if anything changed during verification**

```bash
git status
# If anything was tweaked during smoke testing:
git add -A
git commit -m "chore(auth): post-smoke cleanups"
```

---

## Self-Review

**Spec coverage:**
- Goal / non-goals → covered (Tasks 1–14)
- Auth methods (password + Google) → Task 5
- Email domain gating → Tasks 2 (`isAllowedEmail`), 3 (`isAllowed`), 5 (form check), 6 (route guard), 7 (OAuth callback)
- Forgot-password + reset-password → Tasks 8, 9
- Clerk removal → Tasks 1 (package), 11 (routes/features), 12 (nav scrub)
- Env vars → Task 1, README in Task 13
- Axios 401 path → Task 4
- Tests (store + form) → Tasks 2, 3, 5
- Manual smoke checklist → Task 14
- Dashboard + Google Cloud setup docs → Task 13

**Placeholder scan:** No TBD/TODO. Dynamic-discovery steps (Tasks 11, 12) tell the engineer which grep to run and what to do per hit.

**Type consistency:**
- Store methods named: `signInWithPassword`, `signInWithGoogle`, `signOut`, `sendPasswordReset`, `updatePassword`, `isAllowed` — used consistently across Tasks 3 (definition), 4 (signOut), 5 (signInWithPassword, signInWithGoogle, signOut, isAllowed), 7 (signOut, isAllowed), 8 (sendPasswordReset), 9 (updatePassword, signOut). ✓
- `isAllowedEmail` exported from `src/lib/supabase.ts` (Task 2), used only inside the store (Task 3). Module-internal. ✓
- Status values: `'loading' | 'authenticated' | 'unauthenticated'` consistent across Tasks 3, 6, 7. ✓
- Route paths: `/oauth/callback` (Task 7), `/reset-password` (Task 9), `/sign-in` (existing), `/forgot-password` (existing) — match spec. ✓
