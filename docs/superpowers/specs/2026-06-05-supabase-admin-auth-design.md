# Supabase Admin Auth — Design Spec

**Date:** 2026-06-05
**Author:** Beerus / Zeno Sama
**Status:** Draft, awaiting review

## Goal

Replace the mock auth in `toka-shadcn-admin` with real Supabase authentication, gated to tokatek workspace members only (invite-only admin app). Remove the legacy Clerk integration entirely.

## Non-goals

- Building a user-management UI (invite / list / delete users). Admin manages users from the Supabase Dashboard for v1; a future Edge Function can back a UI later.
- Multi-tenant / multi-org support.
- 2FA / MFA.
- Session impersonation / "login as user".

## Decisions (from brainstorm)

| # | Decision |
|---|---|
| 1 | Auth methods: **email+password** and **Google OAuth** |
| 2 | Gating: **email domain allowlist** (`@tokatek.com`) on client + Google OAuth Workspace restriction as primary defense |
| 3 | Sign-up: **disabled** (invite-only). Forgot-password: **enabled** via Supabase native reset flow |
| 4 | Clerk: **removed completely** (package, routes, env vars) |
| 5 | User management for v1: **Supabase Dashboard only** (no admin API calls from SPA — service_role key must never reach the browser) |

## Architecture

### Modules touched

```
src/
  lib/
    supabase.ts                NEW — client singleton
  stores/
    auth-store.ts              REWRITE — wrap Supabase session
    auth-store.test.ts         REWRITE
  features/auth/
    sign-in/
      components/
        user-auth-form.tsx     REWRITE — real signIn + Google OAuth
    forgot-password/
      components/              UPDATE — wire to supabase.auth.resetPasswordForEmail
    sign-up/                   DELETE (feature folder)
    otp/                       DELETE (feature folder)
  routes/
    (auth)/
      sign-in.tsx              KEEP (route shell only)
      sign-in-2.tsx            DELETE (alternate variant, unused after migration)
      forgot-password.tsx      KEEP
      sign-up.tsx              DELETE
      otp.tsx                  DELETE
      reset-password.tsx       NEW — handles password reset deep-link
      oauth.callback.tsx       NEW — completes OAuth PKCE then redirects
    _authenticated/
      route.tsx                UPDATE — add beforeLoad auth guard
    clerk/                     DELETE entire subtree
  main.tsx                     UPDATE — drop Clerk provider if any; init supabase listener
.env.example                   UPDATE — replace Clerk var with Supabase vars
package.json                   UPDATE — remove @clerk/react, add @supabase/supabase-js
```

### Data flow

```
        ┌─────────────────────┐
        │  sign-in form       │
        └──────────┬──────────┘
                   │
       password    │    google
       ───────────┴──────────────────────────────┐
       │                                          │
       ▼                                          ▼
 signInWithPassword          signInWithOAuth(provider:'google',
       │                                redirectTo:/oauth/callback)
       │                                          │
       │                                          ▼
       │                              Google consent → /oauth/callback
       │                                          │
       └────────────┬─────────────────────────────┘
                    ▼
       supabase.auth onAuthStateChange("SIGNED_IN", session)
                    │
                    ▼
       authStore updates {session, user, status}
                    │
                    ▼
       domain check: user.email endsWith "@tokatek.com" ?
                    │
          ┌─────────┴─────────┐
         yes                  no
          │                    │
          ▼                    ▼
   navigate(redirect||"/")    signOut() + toast("không có quyền")
```

### Auth store contract

```ts
// src/stores/auth-store.ts
type Status = 'loading' | 'authenticated' | 'unauthenticated'

interface AuthState {
  session: Session | null
  user: User | null
  status: Status
  signInWithPassword(email: string, password: string): Promise<{ error: AuthError | null }>
  signInWithGoogle(redirectTo?: string): Promise<{ error: AuthError | null }>
  signOut(): Promise<void>
  sendPasswordReset(email: string): Promise<{ error: AuthError | null }>
  updatePassword(newPassword: string): Promise<{ error: AuthError | null }>
  isAllowed(): boolean // session !== null && email matches @tokatek.com
}
```

Store init wires `supabase.auth.onAuthStateChange` once at module load to keep `session/user/status` synced. The cookie hack (`ACCESS_TOKEN`) is removed — Supabase persists session in `localStorage` itself.

### Route guard

`src/routes/_authenticated/route.tsx` adds:

```ts
beforeLoad: ({ location }) => {
  const { status, isAllowed } = useAuthStore.getState()
  if (status === 'loading') return // router shows pending state until store resolves
  if (!isAllowed()) {
    throw redirect({
      to: '/sign-in',
      search: { redirect: location.href },
    })
  }
}
```

The `loading → authenticated/unauthenticated` transition is driven by the initial `getSession()` resolve inside the store's lazy init. Guard returns early while loading so the router shows the route-level pending state instead of bouncing.

### Sign-in form

- Email + password fields → `authStore.signInWithPassword`
- "Continue with Google" button → `authStore.signInWithGoogle(searchParams.redirect)`
- After `signInWithPassword` resolves: check `isAllowed()`; if not, `signOut()` + toast
- Error toasts: generic "Email hoặc mật khẩu không đúng" for any Supabase error (avoid user enumeration)
- Remove placeholder GitHub / Facebook buttons

### Forgot-password flow

1. `forgot-password.tsx` form → `supabase.auth.resetPasswordForEmail(email, { redirectTo: ${origin}/reset-password })`
2. Always show "Nếu email tồn tại, link đã được gửi" (avoid enumeration)
3. User clicks email link → lands on `/reset-password` with recovery token in URL hash
4. Supabase client auto-parses hash; `onAuthStateChange` fires `PASSWORD_RECOVERY`
5. Reset-password page shows "new password" + "confirm" form → `supabase.auth.updateUser({ password })`
6. On success → redirect `/sign-in` with success toast

Domain gating also applies after recovery — if somehow a non-tokatek email got a reset link, we still kick them out.

### OAuth callback

`src/routes/(auth)/oauth.callback.tsx`:
- Render spinner
- `useEffect`: subscribe to authStore; when `status === 'authenticated'` → check `isAllowed()` → navigate `/` or signOut+`/sign-in`
- If error in URL hash → toast + redirect `/sign-in`

### Google OAuth restriction

Primary defense for "tokatek only" on Google path: in Google Cloud Console, configure OAuth Client → **User Type: Internal** under tokatek Workspace. Google will refuse non-workspace accounts before they reach us. Document this in the spec; not enforced in code but required for deploy.

Secondary client-side `endsWith('@tokatek.com')` check catches:
- Email+password users created by mistake with wrong domain
- Any future provider misconfiguration

### Axios 401 handling

Current `handleServerError` in `src/main.tsx` short-circuits retries on 401/403. Update: on 401 also call `supabase.auth.signOut()` and `router.navigate('/sign-in')`. 403 only navigates to `/errors/forbidden`.

## Configuration

### Env vars

`.env.example` becomes:
```
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
```

Removed: `VITE_CLERK_PUBLISHABLE_KEY`.

Anon key is safe in the browser by design (RLS is the boundary). Service_role key must never appear in any `VITE_*` var.

### Supabase Dashboard config (manual, documented in README)

- **Auth → Providers → Email**: enabled. "Confirm email" = ON globally (required so password-recovery emails are honored). When admin creates a user from the Dashboard, tick "Auto Confirm User" so the user can immediately request a password reset without an inbox-confirmation step. Net effect: admin creates user (auto-confirmed) → user uses Forgot Password to set their first password.
- **Auth → Providers → Google**: enabled, paste OAuth client id/secret
- **Auth → URL Configuration**:
  - Site URL: `http://localhost:5173` (dev) / production URL
  - Redirect URLs: `${SITE}/oauth/callback`, `${SITE}/reset-password`
- **Auth → Email Templates**: customize "Reset Password" template to point at `/reset-password`

### Google Cloud Console (manual)

- OAuth consent screen: **Internal** (Workspace tokatek)
- Authorized redirect URIs: `${SUPABASE_URL}/auth/v1/callback`

## Error handling

| Case | Behavior |
|---|---|
| Wrong password | Toast "Email hoặc mật khẩu không đúng" |
| Unknown email | Same generic toast (no enumeration) |
| Network error | Toast "Không kết nối được, thử lại sau" |
| Non-tokatek email logged in | `signOut()` + toast "Tài khoản không có quyền truy cập" + stay on `/sign-in` |
| OAuth cancelled | Silent return to `/sign-in` |
| Reset link expired | Toast "Link đã hết hạn, vui lòng yêu cầu lại" + redirect `/forgot-password` |
| Session refresh fails | `signOut()` + redirect `/sign-in` |

## Testing

### Unit / component

- `auth-store.test.ts` — mock `@supabase/supabase-js` client; assert:
  - `signInWithPassword` returns error from supabase verbatim
  - `isAllowed` returns true only for `@tokatek.com` session
  - `onAuthStateChange` handler updates `status`
  - `signOut` clears `user/session`
- `user-auth-form.test.tsx` — render in vitest browser mode:
  - Valid `@tokatek.com` login → assert `navigate` called with redirect
  - Non-tokatek login → assert `signOut` called + toast text
  - Google button click → assert `signInWithOAuth` called with correct redirect

### Manual smoke (covered by `/build-feature` QA loop if used)

- Login with seeded `@tokatek.com` account (`E2E_TEST_EMAIL` / `E2E_TEST_PASSWORD`)
- Logout
- Refresh persists session
- Direct visit to `/users` while signed-out redirects to sign-in with `?redirect=`
- Forgot-password → check inbox → reset → login

### Out of scope for automated tests

- Google OAuth flow (third-party redirect, manual smoke only)
- Supabase Dashboard configuration (manual checklist in README)

## Acceptance criteria

- [ ] `@tokatek.com` email+password login → lands on `/`
- [ ] `@tokatek.com` Google login → lands on `/`
- [ ] Non-tokatek successful Supabase auth → kicked out client-side + toast
- [ ] Unauthenticated visit to any `_authenticated/*` route → redirect to `/sign-in?redirect=…`
- [ ] After login, redirect query param is honored
- [ ] Refresh keeps session
- [ ] Sign-out clears session + redirects to `/sign-in`
- [ ] Forgot-password → email received → reset link → set new password → login works
- [ ] All references to `@clerk/*` removed (`grep -r "@clerk" src` empty)
- [ ] `src/routes/clerk/` deleted
- [ ] `.env.example` has only `VITE_SUPABASE_*` (no Clerk)
- [ ] `pnpm lint && pnpm build` pass
- [ ] `pnpm test` pass (incl. new auth tests)

## Risks & open questions

| Risk | Mitigation |
|---|---|
| `service_role` key leaks to client | Hard rule: never use `VITE_` prefix for service key. Admin ops happen in Dashboard until Edge Function is built. |
| Client-side domain check bypassable | Acknowledged. Google OAuth Internal config is the real boundary; client check is UX. Future: add Postgres trigger on `auth.users` to reject non-tokatek emails at insert time. |
| Session refresh race on route guard | Store starts in `status: 'loading'`; guard waits. Resolves after initial `getSession()`. |
| Email confirmation friction | Admin creates user via Dashboard with "Auto Confirm User" toggle on, then user uses forgot-password to set their own password. Document in README. |
| Existing Clerk routes referenced from sidebar / nav | Audit `src/components/layout/*` for any links into `/clerk/*` and remove. |

## Out of scope (future work)

- Edge Function `invite-user` for admin-driven invite UI
- Role-based access control inside the app (currently flat: tokatek = admin)
- 2FA
- Session activity log
- Postgres trigger to enforce email domain at DB level
