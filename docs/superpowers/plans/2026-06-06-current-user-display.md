# Current User Display Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Sidebar footer (`NavUser`) and header `ProfileDropdown` show the logged-in Supabase user (name/email/avatar/initials) instead of hardcoded `satnaing` seed data.

**Architecture:** One shared hook `useCurrentUser()` reads the Supabase `User` from the existing `useAuthStore` zustand store and derives display fields via a pure, directly-testable function `deriveCurrentUser`. Both components consume the hook; the dead seed-user data is removed.

**Tech Stack:** React 19, zustand (`@/stores/auth-store`), Supabase JS (`User` type), Vitest browser mode (tests run in real Chromium), pnpm.

**Spec:** `docs/superpowers/specs/2026-06-06-current-user-display-design.md`

**Conventions reminder:** run `pnpm format` after editing files (imports are auto-sorted by a prettier plugin — never hand-order them). Gate for every task: `pnpm lint && pnpm build` passes.

---

### Task 1: `deriveCurrentUser` + `useCurrentUser` hook (TDD)

**Files:**
- Create: `src/hooks/use-current-user.ts`
- Test: `src/hooks/use-current-user.test.ts`

Derivation rules (from spec):
- `name` = `user_metadata.full_name` (trimmed) if non-empty, else the part of `email` before `@`, else `''`
- `email` = `user.email ?? ''`
- `avatar` = `user_metadata.avatar_url` if it's a string, else `''`
- `initials` = first letters of the first two whitespace-separated words of `name`, uppercased; if `name` is a single word, its first 2 characters uppercased; `''` when name is empty
- `user === null` → all four fields `''` (only happens briefly during hydration; layout sits behind the `_authenticated` guard)

- [ ] **Step 1: Write the failing test**

Create `src/hooks/use-current-user.test.ts`:

```ts
import type { User } from '@supabase/supabase-js'
import { describe, expect, it } from 'vitest'
import { deriveCurrentUser } from '@/hooks/use-current-user'

function makeUser(partial: Partial<User>): User {
  return {
    id: 'user-1',
    aud: 'authenticated',
    app_metadata: {},
    user_metadata: {},
    created_at: '2026-01-01T00:00:00Z',
    ...partial,
  } as User
}

describe('deriveCurrentUser', () => {
  it('uses full_name and avatar_url from user_metadata (Google OAuth)', () => {
    const user = makeUser({
      email: 'hau.lu@doltech.vn',
      user_metadata: {
        full_name: 'Hau Lu',
        avatar_url: 'https://lh3.googleusercontent.com/a/photo.jpg',
      },
    })

    expect(deriveCurrentUser(user)).toEqual({
      name: 'Hau Lu',
      email: 'hau.lu@doltech.vn',
      avatar: 'https://lh3.googleusercontent.com/a/photo.jpg',
      initials: 'HL',
    })
  })

  it('falls back to the email local part when full_name is missing', () => {
    const user = makeUser({ email: 'hau.lu@doltech.vn' })

    expect(deriveCurrentUser(user)).toEqual({
      name: 'hau.lu',
      email: 'hau.lu@doltech.vn',
      avatar: '',
      initials: 'HA',
    })
  })

  it('treats a whitespace-only full_name as missing', () => {
    const user = makeUser({
      email: 'hau.lu@doltech.vn',
      user_metadata: { full_name: '   ' },
    })

    expect(deriveCurrentUser(user).name).toBe('hau.lu')
  })

  it('uses the first letters of the first two words for initials', () => {
    const user = makeUser({
      email: 'a@b.com',
      user_metadata: { full_name: 'Nguyen Van An' },
    })

    expect(deriveCurrentUser(user).initials).toBe('NV')
  })

  it('returns empty fields for a null user', () => {
    expect(deriveCurrentUser(null)).toEqual({
      name: '',
      email: '',
      avatar: '',
      initials: '',
    })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test src/hooks/use-current-user.test.ts`
Expected: FAIL — cannot resolve import `@/hooks/use-current-user` (module does not exist yet).

- [ ] **Step 3: Write the implementation**

Create `src/hooks/use-current-user.ts`:

```ts
import type { User } from '@supabase/supabase-js'
import { useAuthStore } from '@/stores/auth-store'

type CurrentUser = {
  name: string
  email: string
  avatar: string
  initials: string
}

export function deriveCurrentUser(user: User | null): CurrentUser {
  if (!user) return { name: '', email: '', avatar: '', initials: '' }

  const email = user.email ?? ''
  const metadata = user.user_metadata ?? {}
  const fullName =
    typeof metadata.full_name === 'string' ? metadata.full_name.trim() : ''
  const name = fullName || email.split('@')[0]
  const avatar =
    typeof metadata.avatar_url === 'string' ? metadata.avatar_url : ''

  const words = name.split(/\s+/).filter(Boolean)
  const initials =
    words.length >= 2
      ? (words[0][0] + words[1][0]).toUpperCase()
      : name.slice(0, 2).toUpperCase()

  return { name, email, avatar, initials }
}

export function useCurrentUser(): CurrentUser {
  const user = useAuthStore((state) => state.user)
  return deriveCurrentUser(user)
}
```

Note: no memoization needed — the zustand selector only triggers re-render when `user` changes reference, and the derived object is consumed in the same render.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test src/hooks/use-current-user.test.ts`
Expected: PASS — 5 tests.

- [ ] **Step 5: Format, lint, commit**

```bash
pnpm format
pnpm lint
git add src/hooks/use-current-user.ts src/hooks/use-current-user.test.ts
git commit -m "feat(auth): add useCurrentUser hook deriving display fields from supabase user"
```

---

### Task 2: Wire `NavUser` (sidebar footer) to the hook

**Files:**
- Modify: `src/components/layout/nav-user.tsx` (drop the `user` prop, call the hook, replace `SN` fallbacks)
- Modify: `src/components/layout/app-sidebar.tsx:32` (stop passing the prop)

- [ ] **Step 1: Rewrite `nav-user.tsx` to consume the hook**

Changes relative to current file: remove the `NavUserProps` type and the `user` prop, add the `useCurrentUser` import and call, and replace both hardcoded `SN` `AvatarFallback`s with `{user.initials}`. Full new content:

```tsx
import { Link } from '@tanstack/react-router'
import {
  BadgeCheck,
  Bell,
  ChevronsUpDown,
  CreditCard,
  LogOut,
  Sparkles,
} from 'lucide-react'
import { useCurrentUser } from '@/hooks/use-current-user'
import useDialogState from '@/hooks/use-dialog-state'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from '@/components/ui/sidebar'
import { SignOutDialog } from '@/components/sign-out-dialog'

export function NavUser() {
  const { isMobile } = useSidebar()
  const user = useCurrentUser()
  const [open, setOpen] = useDialogState()

  return (
    <>
      <SidebarMenu>
        <SidebarMenuItem>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <SidebarMenuButton
                size='lg'
                className='data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground'
              >
                <Avatar className='h-8 w-8 rounded-lg'>
                  <AvatarImage src={user.avatar} alt={user.name} />
                  <AvatarFallback className='rounded-lg'>
                    {user.initials}
                  </AvatarFallback>
                </Avatar>
                <div className='grid flex-1 text-start text-sm leading-tight'>
                  <span className='truncate font-semibold'>{user.name}</span>
                  <span className='truncate text-xs'>{user.email}</span>
                </div>
                <ChevronsUpDown className='ms-auto size-4' />
              </SidebarMenuButton>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              className='w-(--radix-dropdown-menu-trigger-width) min-w-56 rounded-lg'
              side={isMobile ? 'bottom' : 'right'}
              align='end'
              sideOffset={4}
            >
              <DropdownMenuLabel className='p-0 font-normal'>
                <div className='flex items-center gap-2 px-1 py-1.5 text-start text-sm'>
                  <Avatar className='h-8 w-8 rounded-lg'>
                    <AvatarImage src={user.avatar} alt={user.name} />
                    <AvatarFallback className='rounded-lg'>
                      {user.initials}
                    </AvatarFallback>
                  </Avatar>
                  <div className='grid flex-1 text-start text-sm leading-tight'>
                    <span className='truncate font-semibold'>{user.name}</span>
                    <span className='truncate text-xs'>{user.email}</span>
                  </div>
                </div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuGroup>
                <DropdownMenuItem>
                  <Sparkles />
                  Upgrade to Pro
                </DropdownMenuItem>
              </DropdownMenuGroup>
              <DropdownMenuSeparator />
              <DropdownMenuGroup>
                <DropdownMenuItem asChild>
                  <Link to='/settings/account'>
                    <BadgeCheck />
                    Account
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link to='/settings'>
                    <CreditCard />
                    Billing
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link to='/settings/notifications'>
                    <Bell />
                    Notifications
                  </Link>
                </DropdownMenuItem>
              </DropdownMenuGroup>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                variant='destructive'
                onClick={() => setOpen(true)}
              >
                <LogOut />
                Sign out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </SidebarMenuItem>
      </SidebarMenu>

      <SignOutDialog open={!!open} onOpenChange={setOpen} />
    </>
  )
}
```

- [ ] **Step 2: Update the call site in `app-sidebar.tsx`**

In `src/components/layout/app-sidebar.tsx`, line 32, change:

```tsx
<NavUser user={sidebarData.user} />
```

to:

```tsx
<NavUser />
```

(`sidebarData` stays imported — it's still used for `teams` and `navGroups`.)

- [ ] **Step 3: Format, lint, build**

Run: `pnpm format && pnpm lint && pnpm build`
Expected: all pass, no unused-import warnings.

- [ ] **Step 4: Commit**

```bash
git add src/components/layout/nav-user.tsx src/components/layout/app-sidebar.tsx
git commit -m "feat(layout): show logged-in user in sidebar footer"
```

---

### Task 3: Wire `ProfileDropdown` (header) to the hook

**Files:**
- Modify: `src/components/profile-dropdown.tsx`

- [ ] **Step 1: Replace hardcoded values with hook data**

Changes relative to current file: add the `useCurrentUser` import and call, replace the hardcoded `AvatarImage src='/avatars/01.png' alt='@shadcn'`, the `SN` fallback, and the `satnaing` / `satnaingdev@gmail.com` label. Full new content:

```tsx
import { Link } from '@tanstack/react-router'
import { useCurrentUser } from '@/hooks/use-current-user'
import useDialogState from '@/hooks/use-dialog-state'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { SignOutDialog } from '@/components/sign-out-dialog'

export function ProfileDropdown() {
  const user = useCurrentUser()
  const [open, setOpen] = useDialogState()

  return (
    <>
      <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild>
          <Button variant='ghost' className='relative h-8 w-8 rounded-full'>
            <Avatar className='h-8 w-8'>
              <AvatarImage src={user.avatar} alt={user.name} />
              <AvatarFallback>{user.initials}</AvatarFallback>
            </Avatar>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent className='w-56' align='end' forceMount>
          <DropdownMenuLabel className='font-normal'>
            <div className='flex flex-col gap-1.5'>
              <p className='text-sm leading-none font-medium'>{user.name}</p>
              <p className='text-xs leading-none text-muted-foreground'>
                {user.email}
              </p>
            </div>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuGroup>
            <DropdownMenuItem asChild>
              <Link to='/settings'>
                Profile
                <DropdownMenuShortcut>⇧⌘P</DropdownMenuShortcut>
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link to='/settings'>
                Billing
                <DropdownMenuShortcut>⌘B</DropdownMenuShortcut>
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link to='/settings'>
                Settings
                <DropdownMenuShortcut>⌘S</DropdownMenuShortcut>
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem>New Team</DropdownMenuItem>
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
          <DropdownMenuItem variant='destructive' onClick={() => setOpen(true)}>
            Sign out
            <DropdownMenuShortcut className='text-current'>
              ⇧⌘Q
            </DropdownMenuShortcut>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <SignOutDialog open={!!open} onOpenChange={setOpen} />
    </>
  )
}
```

- [ ] **Step 2: Format, lint, build**

Run: `pnpm format && pnpm lint && pnpm build`
Expected: all pass.

- [ ] **Step 3: Commit**

```bash
git add src/components/profile-dropdown.tsx
git commit -m "feat(layout): show logged-in user in header profile dropdown"
```

---

### Task 4: Remove dead seed-user data + final verification

**Files:**
- Modify: `src/components/layout/data/sidebar-data.ts:28-32` (remove `user` block)
- Modify: `src/components/layout/types.ts` (remove `User` type and `user` field)

- [ ] **Step 1: Remove the `user` block from `sidebar-data.ts`**

In `src/components/layout/data/sidebar-data.ts`, delete lines 28–32 so the object starts with `teams`:

```ts
export const sidebarData: SidebarData = {
  teams: [
```

(Everything else in the file is unchanged.)

- [ ] **Step 2: Remove the `User` type from `types.ts`**

In `src/components/layout/types.ts`, delete the `User` type (lines 3–7):

```ts
type User = {
  name: string
  email: string
  avatar: string
}
```

and remove the `user` field from `SidebarData` (line 39), leaving:

```ts
type SidebarData = {
  teams: Team[]
  navGroups: NavGroup[]
}
```

The export line `export type { SidebarData, NavGroup, NavItem, NavCollapsible, NavLink }` stays as is (`User` was never exported).

- [ ] **Step 3: Full verification**

Run: `pnpm format && pnpm lint && pnpm build && pnpm test && pnpm knip`
Expected: all pass. Knip must not flag `use-current-user.ts` exports: `deriveCurrentUser` is consumed by the colocated test (knip's vitest plugin treats test files as entries — same pattern as `NavigateFn` in `use-table-url-state.ts`), `useCurrentUser` by both components, and `CurrentUser` is intentionally NOT exported.

- [ ] **Step 4: Commit**

```bash
git add src/components/layout/data/sidebar-data.ts src/components/layout/types.ts
git commit -m "chore(layout): drop hardcoded seed user from sidebar data"
```

- [ ] **Step 5: Visual check on dev server**

Run `pnpm dev`, sign in (Supabase test user from `.env.local`: `E2E_TEST_EMAIL` / `E2E_TEST_PASSWORD`), open `/` and confirm:
- Sidebar footer shows the logged-in user's name + email (for an email/password test user: local part of the email + initials fallback avatar).
- Header avatar dropdown shows the same user.
- No `satnaing` anywhere: `grep -rn "satnaing" src/` returns nothing.
