# Users Page on Supabase `user_profiles` (Full CRUD) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the faker-seeded `/users` list with live data from the Supabase `user_profiles` table (server-side pagination/filtering) and wire all dialogs to real create/update/invite/delete operations.

**Architecture:** Hybrid per the approved spec (`docs/superpowers/specs/2026-06-06-users-supabase-crud-design.md`): a Postgres security-definer RPC (`admin_list_user_profiles`) + admin RLS policies handle list & profile edits; one Edge Function (`admin-users`, service role) handles create/invite/delete which require the GoTrue admin API. Frontend mirrors the existing Entry feature pattern (TanStack Query + `manualPagination` + `useTableUrlState`).

**Tech Stack:** Vite + React 19 + TS, TanStack Router/Query/Table, zod, react-hook-form, supabase-js, Supabase Edge Functions (Deno), vitest browser mode.

**Important constraints:**
- Supabase project ref: `nuktewpnwemvmqdmxued`. DB schema is normally migrated by **Flyway from another repo** — every SQL change here must also be copied there (reminder in final task).
- The known admin user for SQL-level verification: `b37c0828-cd87-4983-86fb-ce94b24a9b24` (Toka Dev); a non-admin user: `8f962bcf-cfde-49a1-b59c-8b9d5768c656`. The table currently has 3 rows.
- A DB trigger `handle_new_user` on `auth.users` auto-creates a `user_profiles` row (display_name from `user_metadata.display_name`, role `user`).
- `user_profiles.id` → `auth.users(id) ON DELETE CASCADE`, so deleting the auth user removes the profile.
- Tasks 4–8 transiently break `pnpm build` (many files reference the old schema until all are rewritten). Vitest does NOT typecheck, so per-task test runs still work. Full `pnpm lint && pnpm build && pnpm test` gate is Task 9. Commit per task on the feature branch anyway.
- Supabase MCP tools used by this plan: `mcp__supabase__apply_migration`, `mcp__supabase__execute_sql`, `mcp__supabase__deploy_edge_function`. If unavailable, stop and ask the user.

---

### Task 1: Feature branch

- [ ] **Step 1: Create branch**

```bash
cd /home/liuhao/Documents/personal-v2/toka-shadcn-admin
git checkout develop && git checkout -b feature/users-supabase-crud
```

---

### Task 2: Database migration (is_admin, policies, list RPC)

**Files:**
- Create: `supabase/migrations/20260606000000_admin_users_access.sql` (repo copy; canonical home is the Flyway repo)

- [ ] **Step 1: Write the migration SQL file**

Create `supabase/migrations/20260606000000_admin_users_access.sql` with exactly:

```sql
-- Admin access for the /users management page.
-- NOTE: this database is normally migrated via Flyway from the backend repo.
-- Copy this file there as the canonical migration.

-- Helper: is the calling user an admin? SECURITY DEFINER avoids recursive
-- RLS evaluation when policies on user_profiles reference user_profiles.
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.user_profiles
    where id = auth.uid() and role = 'admin'
  );
$$;

revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to authenticated;

-- Admins can read every profile (existing self-read policy stays in place).
drop policy if exists "Admins can read all profiles" on public.user_profiles;
create policy "Admins can read all profiles"
  on public.user_profiles
  for select
  to authenticated
  using (public.is_admin());

-- Admins can update any profile, including role changes.
drop policy if exists "Admins can update any profile" on public.user_profiles;
create policy "Admins can update any profile"
  on public.user_profiles
  for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- Paginated admin listing joining auth.users for the email address.
-- total_count is a window count repeated on every row.
create or replace function public.admin_list_user_profiles(
  p_page integer default 1,
  p_page_size integer default 10,
  p_search text default null,
  p_roles text[] default null
)
returns table (
  id uuid,
  display_name text,
  nick_name text,
  avatar_url text,
  email text,
  role text,
  created_at timestamptz,
  updated_at timestamptz,
  total_count bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'Permission denied: admin only' using errcode = '42501';
  end if;

  return query
  select
    p.id,
    p.display_name,
    p.nick_name,
    p.avatar_url,
    u.email::text,
    p.role,
    p.created_at,
    p.updated_at,
    count(*) over () as total_count
  from public.user_profiles p
  join auth.users u on u.id = p.id
  where
    (
      p_search is null or p_search = ''
      or p.display_name ilike '%' || p_search || '%'
      or p.nick_name ilike '%' || p_search || '%'
      or u.email ilike '%' || p_search || '%'
    )
    and (p_roles is null or cardinality(p_roles) = 0 or p.role = any (p_roles))
  order by p.created_at desc
  limit p_page_size
  offset (greatest(p_page, 1) - 1) * p_page_size;
end;
$$;

revoke all on function public.admin_list_user_profiles(integer, integer, text, text[]) from public;
grant execute on function public.admin_list_user_profiles(integer, integer, text, text[]) to authenticated;
```

- [ ] **Step 2: Apply the migration to the remote project**

Call `mcp__supabase__apply_migration` with `name: "admin_users_access"` and `query` set to the full file content above.

- [ ] **Step 3: Verify as admin (simulated JWT)**

Call `mcp__supabase__execute_sql` with:

```sql
begin;
select set_config('request.jwt.claims',
  '{"sub":"b37c0828-cd87-4983-86fb-ce94b24a9b24","role":"authenticated"}', true);
set local role authenticated;
select public.is_admin() as is_admin;
select id, email, role, total_count from public.admin_list_user_profiles(1, 10, null, null);
select count(*) as visible_profiles from public.user_profiles;
rollback;
```

Expected: `is_admin = true`; RPC returns **3 rows** each with `total_count = 3` and a non-null `email`; `visible_profiles = 3`.

- [ ] **Step 4: Verify as non-admin (RPC must raise, table shows only self)**

Call `mcp__supabase__execute_sql` with (separate calls — the exception aborts the transaction):

```sql
begin;
select set_config('request.jwt.claims',
  '{"sub":"8f962bcf-cfde-49a1-b59c-8b9d5768c656","role":"authenticated"}', true);
set local role authenticated;
select count(*) as visible_profiles from public.user_profiles;
rollback;
```

Expected: `visible_profiles = 1`. Then:

```sql
begin;
select set_config('request.jwt.claims',
  '{"sub":"8f962bcf-cfde-49a1-b59c-8b9d5768c656","role":"authenticated"}', true);
set local role authenticated;
select * from public.admin_list_user_profiles(1, 10, null, null);
rollback;
```

Expected: ERROR `Permission denied: admin only`.

- [ ] **Step 5: Verify search & role filters**

```sql
begin;
select set_config('request.jwt.claims',
  '{"sub":"b37c0828-cd87-4983-86fb-ce94b24a9b24","role":"authenticated"}', true);
set local role authenticated;
select email, total_count from public.admin_list_user_profiles(1, 10, 'toka', null);
select email, role from public.admin_list_user_profiles(1, 10, null, array['admin']);
rollback;
```

Expected: search returns the rows whose name/nick/email contains `toka`; role filter returns only the 2 `admin` rows.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20260606000000_admin_users_access.sql
git commit -m "feat(db): admin read/update policies and admin_list_user_profiles RPC"
```

---

### Task 3: Edge Function `admin-users`

**Files:**
- Create: `supabase/functions/admin-users/index.ts`

- [ ] **Step 1: Write the function source**

Create `supabase/functions/admin-users/index.ts` with exactly:

```ts
import { createClient } from 'npm:@supabase/supabase-js@2'

type AdminUsersPayload =
  | {
      action: 'create'
      email: string
      password: string
      displayName: string
      role: 'admin' | 'user'
    }
  | { action: 'invite'; email: string; role: 'admin' | 'user' }
  | { action: 'delete'; userId: string }

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  try {
    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    // Identify the caller from the JWT and require an admin profile.
    const jwt = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '')
    const { data: callerData, error: callerError } = await admin.auth.getUser(jwt)
    if (callerError || !callerData.user) return json({ error: 'Unauthorized' }, 401)
    const caller = callerData.user

    const { data: profile, error: profileError } = await admin
      .from('user_profiles')
      .select('role')
      .eq('id', caller.id)
      .single()
    if (profileError || profile?.role !== 'admin') {
      return json({ error: 'Forbidden: admin only' }, 403)
    }

    const payload = (await req.json()) as AdminUsersPayload

    switch (payload.action) {
      case 'create': {
        if (!payload.email || !payload.password || !payload.displayName) {
          return json({ error: 'email, password and displayName are required' }, 400)
        }
        // The on_auth_user_created trigger creates the user_profiles row.
        const { data, error } = await admin.auth.admin.createUser({
          email: payload.email,
          password: payload.password,
          email_confirm: true,
          user_metadata: { display_name: payload.displayName },
        })
        if (error) return json({ error: error.message }, 400)
        if (payload.role === 'admin') {
          const { error: roleError } = await admin
            .from('user_profiles')
            .update({ role: 'admin' })
            .eq('id', data.user.id)
          if (roleError) return json({ error: roleError.message }, 500)
        }
        return json({ ok: true, userId: data.user.id })
      }
      case 'invite': {
        if (!payload.email) return json({ error: 'email is required' }, 400)
        const { data, error } = await admin.auth.admin.inviteUserByEmail(payload.email)
        if (error) return json({ error: error.message }, 400)
        if (payload.role === 'admin') {
          const { error: roleError } = await admin
            .from('user_profiles')
            .update({ role: 'admin' })
            .eq('id', data.user.id)
          if (roleError) return json({ error: roleError.message }, 500)
        }
        return json({ ok: true, userId: data.user.id })
      }
      case 'delete': {
        if (!payload.userId) return json({ error: 'userId is required' }, 400)
        if (payload.userId === caller.id) {
          return json({ error: 'You cannot delete your own account' }, 400)
        }
        // FK cascade removes the user_profiles row.
        const { error } = await admin.auth.admin.deleteUser(payload.userId)
        if (error) return json({ error: error.message }, 400)
        return json({ ok: true })
      }
      default:
        return json({ error: 'Unknown action' }, 400)
    }
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : 'Internal error' }, 500)
  }
})
```

- [ ] **Step 2: Deploy**

Call `mcp__supabase__deploy_edge_function` with `name: "admin-users"`, `entrypoint_path: "index.ts"`, and `files: [{ name: "index.ts", content: <full file content above> }]`.

- [ ] **Step 3: Negative test (anon JWT → 401 from our handler)**

```bash
ANON_KEY=$(grep VITE_SUPABASE_ANON_KEY /home/liuhao/Documents/personal-v2/toka-shadcn-admin/.env.local | cut -d= -f2)
curl -s -o /dev/null -w "%{http_code}\n" -X POST \
  "https://nuktewpnwemvmqdmxued.supabase.co/functions/v1/admin-users" \
  -H "Authorization: Bearer $ANON_KEY" -H "apikey: $ANON_KEY" \
  -H "Content-Type: application/json" -d '{"action":"delete","userId":"x"}'
```

Expected: `401`. (Full positive-path testing happens in Task 10 via the app.)

- [ ] **Step 4: Commit**

```bash
git add supabase/functions/admin-users/index.ts
git commit -m "feat(edge): admin-users function for create/invite/delete"
```

---

### Task 4: Frontend data layer (schema, facets, drop faker)

**Files:**
- Rewrite: `src/features/users/data/schema.ts`
- Rewrite: `src/features/users/data/data.ts`
- Delete: `src/features/users/data/users.ts`

- [ ] **Step 1: Rewrite `src/features/users/data/schema.ts`**

```ts
import { z } from 'zod'

export const userRoleValues = ['admin', 'user', 'anonymous'] as const
export type UserRole = (typeof userRoleValues)[number]

// Rows come from the admin_list_user_profiles RPC (snake_case, with a
// total_count window column repeated on every row).
const userRowSchema = z
  .object({
    id: z.string(),
    display_name: z.string().nullable(),
    nick_name: z.string().nullable(),
    avatar_url: z.string().nullable(),
    email: z.string(),
    role: z.enum(userRoleValues),
    created_at: z.coerce.date(),
    updated_at: z.coerce.date(),
    total_count: z.number(),
  })
  .transform((row) => ({
    id: row.id,
    displayName: row.display_name ?? '',
    nickName: row.nick_name ?? '',
    avatarUrl: row.avatar_url,
    email: row.email,
    role: row.role,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    totalCount: row.total_count,
  }))

export const userRowsSchema = z.array(userRowSchema)
export type UserWithCount = z.infer<typeof userRowSchema>
export type User = Omit<UserWithCount, 'totalCount'>
```

- [ ] **Step 2: Rewrite `src/features/users/data/data.ts`**

```ts
import { Ghost, Shield, UserRound } from 'lucide-react'
import { type UserRole } from './schema'

export const roleColors = new Map<UserRole, string>([
  ['admin', 'bg-sky-200/40 text-sky-900 dark:text-sky-100 border-sky-300'],
  ['user', 'bg-teal-100/30 text-teal-900 dark:text-teal-200 border-teal-200'],
  ['anonymous', 'bg-neutral-300/40 border-neutral-300'],
])

export const roles = [
  { label: 'Admin', value: 'admin', icon: Shield },
  { label: 'User', value: 'user', icon: UserRound },
  { label: 'Anonymous', value: 'anonymous', icon: Ghost },
] as const

// Roles an admin can assign from the dialogs ('anonymous' is system-managed).
export const assignableRoles = roles.filter((r) => r.value !== 'anonymous')
```

- [ ] **Step 3: Delete the faker fixture**

```bash
git rm src/features/users/data/users.ts
```

- [ ] **Step 4: Commit**

```bash
git add src/features/users/data/schema.ts src/features/users/data/data.ts
git commit -m "feat(users): real user_profiles schema, drop faker fixture"
```

(Build is transiently broken from here until Task 8 — expected.)

---

### Task 5: Query + mutation hooks

**Files:**
- Create: `src/features/users/hooks/use-users-data.ts`
- Create: `src/features/users/hooks/use-users-mutations.ts`
- Modify: `src/lib/handle-server-error.ts`

- [ ] **Step 1: Create `src/features/users/hooks/use-users-data.ts`**

```ts
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { userRowsSchema, type User, type UserRole } from '../data/schema'

export type UsersFilters = {
  search?: string
  role?: UserRole[]
}

type UseUsersDataParams = {
  pageIndex: number
  pageSize: number
  filters: UsersFilters
}

export const usersKeys = {
  all: ['users'] as const,
  list: (params: UseUsersDataParams) =>
    [...usersKeys.all, 'list', params] as const,
}

type UsersQueryResult = {
  rows: User[]
  count: number
}

async function fetchUsers({
  pageIndex,
  pageSize,
  filters,
}: UseUsersDataParams): Promise<UsersQueryResult> {
  const { data, error } = await supabase.rpc('admin_list_user_profiles', {
    p_page: pageIndex + 1,
    p_page_size: pageSize,
    p_search: filters.search?.trim() || null,
    p_roles: filters.role && filters.role.length > 0 ? filters.role : null,
  })

  if (error) {
    throw new Error(error.message)
  }

  const parsed = userRowsSchema.parse(data ?? [])
  const count = parsed[0]?.totalCount ?? 0
  const rows = parsed.map(({ totalCount: _totalCount, ...user }) => user)
  return { rows, count }
}

export function useUsersData(params: UseUsersDataParams) {
  const query = useQuery({
    queryKey: usersKeys.list(params),
    queryFn: () => fetchUsers(params),
    placeholderData: keepPreviousData,
  })

  return {
    data: query.data?.rows ?? [],
    count: query.data?.count ?? 0,
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    error: query.error,
    refetch: query.refetch,
  }
}
```

- [ ] **Step 2: Create `src/features/users/hooks/use-users-mutations.ts`**

```ts
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { FunctionsHttpError } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import { usersKeys } from './use-users-data'

export type AssignableRole = 'admin' | 'user'

type AdminUsersPayload =
  | {
      action: 'create'
      email: string
      password: string
      displayName: string
      role: AssignableRole
    }
  | { action: 'invite'; email: string; role: AssignableRole }
  | { action: 'delete'; userId: string }

async function invokeAdminUsers(payload: AdminUsersPayload) {
  const { data, error } = await supabase.functions.invoke('admin-users', {
    body: payload,
  })
  if (error) {
    let message = error.message
    if (error instanceof FunctionsHttpError) {
      const body = (await error.context.json().catch(() => null)) as {
        error?: string
      } | null
      if (body?.error) message = body.error
    }
    throw new Error(message)
  }
  return data as { ok: true; userId?: string }
}

function useInvalidateUsers() {
  const queryClient = useQueryClient()
  return () => queryClient.invalidateQueries({ queryKey: usersKeys.all })
}

export function useCreateUser() {
  const invalidate = useInvalidateUsers()
  return useMutation({
    mutationFn: (input: {
      email: string
      password: string
      displayName: string
      role: AssignableRole
    }) => invokeAdminUsers({ action: 'create', ...input }),
    onSuccess: invalidate,
  })
}

export function useInviteUser() {
  const invalidate = useInvalidateUsers()
  return useMutation({
    mutationFn: (input: { email: string; role: AssignableRole }) =>
      invokeAdminUsers({ action: 'invite', ...input }),
    onSuccess: invalidate,
  })
}

export function useDeleteUser() {
  const invalidate = useInvalidateUsers()
  return useMutation({
    mutationFn: (userId: string) => invokeAdminUsers({ action: 'delete', userId }),
    onSuccess: invalidate,
  })
}

export function useDeleteUsers() {
  const invalidate = useInvalidateUsers()
  return useMutation({
    mutationFn: async (userIds: string[]) => {
      await Promise.all(
        userIds.map((userId) => invokeAdminUsers({ action: 'delete', userId }))
      )
    },
    onSuccess: invalidate,
  })
}

export function useUpdateUser() {
  const invalidate = useInvalidateUsers()
  return useMutation({
    mutationFn: async (input: {
      id: string
      displayName: string
      nickName: string | null
      role: AssignableRole
    }) => {
      const { error } = await supabase
        .from('user_profiles')
        .update({
          display_name: input.displayName,
          nick_name: input.nickName,
          role: input.role,
          updated_at: new Date().toISOString(),
        })
        .eq('id', input.id)
      if (error) throw new Error(error.message)
    },
    onSuccess: invalidate,
  })
}
```

- [ ] **Step 3: Surface `Error.message` in the global handler**

In `src/lib/handle-server-error.ts`, insert between the `204` block and the `AxiosError` block:

```ts
  if (error instanceof Error && error.message) {
    errMsg = error.message
  }
```

(The `AxiosError` title branch stays after it and still wins for axios errors.)

- [ ] **Step 4: Commit**

```bash
git add src/features/users/hooks/ src/lib/handle-server-error.ts
git commit -m "feat(users): supabase list query and CRUD mutation hooks"
```

---

### Task 6: Shared `TableSkeleton` (promote from entry feature)

**Files:**
- Create: `src/components/data-table/table-skeleton.tsx`
- Modify: `src/components/data-table/index.ts`
- Modify: `src/features/entry/components/full-tests-table.tsx`, `src/features/entry/components/part-tests-table.tsx`
- Delete: `src/features/entry/components/entry-table-skeleton.tsx`

- [ ] **Step 1: Create `src/components/data-table/table-skeleton.tsx`**

Same implementation as the entry one, renamed:

```tsx
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableRow } from '@/components/ui/table'

type TableSkeletonProps = {
  columnCount: number
  rowCount?: number
}

export function TableSkeleton({ columnCount, rowCount = 8 }: TableSkeletonProps) {
  return (
    <Table>
      <TableBody>
        {Array.from({ length: rowCount }).map((_, rowIndex) => (
          <TableRow key={rowIndex}>
            {Array.from({ length: columnCount }).map((__, cellIndex) => (
              <TableCell key={cellIndex}>
                <Skeleton className='h-5 w-full' />
              </TableCell>
            ))}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}
```

- [ ] **Step 2: Export it** — append to `src/components/data-table/index.ts`:

```ts
export { TableSkeleton } from './table-skeleton'
```

- [ ] **Step 3: Switch entry tables to the shared component**

In both `full-tests-table.tsx` and `part-tests-table.tsx`: remove `import { EntryTableSkeleton } from './entry-table-skeleton'`, add `TableSkeleton` to the existing `@/components/data-table` import, and replace `<EntryTableSkeleton columnCount={columns.length} />` with `<TableSkeleton columnCount={columns.length} />`. Then:

```bash
git rm src/features/entry/components/entry-table-skeleton.tsx
```

- [ ] **Step 4: Verify entry feature still compiles in isolation**

```bash
npx tsc -b --dry 2>/dev/null || true
grep -rn "EntryTableSkeleton" src/ && echo "LEFTOVER REFS" || echo "clean"
```

Expected: `clean`.

- [ ] **Step 5: Commit**

```bash
git add src/components/data-table/ src/features/entry/components/
git commit -m "refactor(data-table): promote table skeleton to shared component"
```

---

### Task 7: Dialogs + row/bulk actions (TDD per dialog)

All dialog tests mock `../hooks/use-users-mutations` (module from Task 5), so they run before the table is rewired. Use `vi.hoisted` for mock fns referenced inside `vi.mock` factories — plain top-level `const`s fail due to hoisting.

**Files:**
- Rewrite: `src/features/users/components/users-action-dialog.tsx` + `.test.tsx`
- Rewrite: `src/features/users/components/users-invite-dialog.tsx` + `.test.tsx`
- Rewrite: `src/features/users/components/users-delete-dialog.tsx` + `.test.tsx`
- Rewrite: `src/features/users/components/users-multi-delete-dialog.tsx` + `.test.tsx`
- Modify: `src/features/users/components/data-table-bulk-actions.tsx`
- Modify: `src/features/users/components/data-table-row-actions.tsx`
- Modify: `src/test-utils/tanstack-table.tsx` (or `.ts` — check extension)

#### 7a. Action dialog (add/edit)

- [ ] **Step 1: Rewrite the failing test** `users-action-dialog.test.tsx`:

```tsx
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
      await userEvent.fill(getByLabelText(/confirm password/i), 'S3cur3P@ssw0rd')

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
      await expect
        .element(getByText(/^Password$/i))
        .not.toBeInTheDocument()
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
```

- [ ] **Step 2: Run it — must fail** (`pnpm test src/features/users/components/users-action-dialog.test.tsx`; fails: component still renders firstName/username fields).

- [ ] **Step 3: Rewrite `users-action-dialog.tsx`**

```tsx
'use client'

import { z } from 'zod'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
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
import { SelectDropdown } from '@/components/select-dropdown'
import { assignableRoles } from '../data/data'
import { type User } from '../data/schema'
import {
  useCreateUser,
  useUpdateUser,
  type AssignableRole,
} from '../hooks/use-users-mutations'

const formSchema = z
  .object({
    displayName: z.string().min(1, 'Display name is required.'),
    nickName: z.string().optional(),
    email: z.email({
      error: (iss) => (iss.input === '' ? 'Email is required.' : undefined),
    }),
    role: z.string().min(1, 'Role is required.'),
    password: z.string().transform((pwd) => pwd.trim()),
    confirmPassword: z.string().transform((pwd) => pwd.trim()),
    isEdit: z.boolean(),
  })
  .refine((d) => d.isEdit || d.password.length > 0, {
    message: 'Password is required.',
    path: ['password'],
  })
  .refine((d) => d.isEdit || d.password.length >= 8, {
    message: 'Password must be at least 8 characters long.',
    path: ['password'],
  })
  .refine((d) => d.isEdit || /[a-z]/.test(d.password), {
    message: 'Password must contain at least one lowercase letter.',
    path: ['password'],
  })
  .refine((d) => d.isEdit || /\d/.test(d.password), {
    message: 'Password must contain at least one number.',
    path: ['password'],
  })
  .refine((d) => d.isEdit || d.password === d.confirmPassword, {
    message: "Passwords don't match.",
    path: ['confirmPassword'],
  })
type UserForm = z.infer<typeof formSchema>

type UserActionDialogProps = {
  currentRow?: User
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function UsersActionDialog({
  currentRow,
  open,
  onOpenChange,
}: UserActionDialogProps) {
  const isEdit = !!currentRow
  const createUser = useCreateUser()
  const updateUser = useUpdateUser()

  const form = useForm<UserForm>({
    resolver: zodResolver(formSchema),
    defaultValues: currentRow
      ? {
          displayName: currentRow.displayName,
          nickName: currentRow.nickName,
          email: currentRow.email,
          role: currentRow.role,
          password: '',
          confirmPassword: '',
          isEdit,
        }
      : {
          displayName: '',
          nickName: '',
          email: '',
          role: '',
          password: '',
          confirmPassword: '',
          isEdit,
        },
  })

  const isPending = createUser.isPending || updateUser.isPending
  const isPasswordTouched = !!form.formState.dirtyFields.password

  const onSubmit = async (values: UserForm) => {
    try {
      if (currentRow) {
        await updateUser.mutateAsync({
          id: currentRow.id,
          displayName: values.displayName,
          nickName: values.nickName?.trim() || null,
          role: values.role as AssignableRole,
        })
        toast.success('User updated')
      } else {
        await createUser.mutateAsync({
          email: values.email,
          password: values.password,
          displayName: values.displayName,
          role: values.role as AssignableRole,
        })
        toast.success('User created')
      }
      form.reset()
      onOpenChange(false)
    } catch {
      // Error toast is shown by the global mutation onError handler.
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(state) => {
        form.reset()
        onOpenChange(state)
      }}
    >
      <DialogContent className='sm:max-w-lg'>
        <DialogHeader className='text-start'>
          <DialogTitle>{isEdit ? 'Edit User' : 'Add New User'}</DialogTitle>
          <DialogDescription>
            {isEdit ? 'Update the user here. ' : 'Create new user here. '}
            Click save when you&apos;re done.
          </DialogDescription>
        </DialogHeader>
        <div className='w-[calc(100%+0.75rem)] overflow-y-auto py-1 pe-3'>
          <Form {...form}>
            <form
              id='user-form'
              onSubmit={form.handleSubmit(onSubmit)}
              className='space-y-4 px-0.5'
            >
              <FormField
                control={form.control}
                name='displayName'
                render={({ field }) => (
                  <FormItem className='grid grid-cols-6 items-center space-y-0 gap-x-4 gap-y-1'>
                    <FormLabel className='col-span-2 text-end'>
                      Display Name
                    </FormLabel>
                    <FormControl>
                      <Input
                        placeholder='John Doe'
                        className='col-span-4'
                        autoComplete='off'
                        {...field}
                      />
                    </FormControl>
                    <FormMessage className='col-span-4 col-start-3' />
                  </FormItem>
                )}
              />
              {isEdit && (
                <FormField
                  control={form.control}
                  name='nickName'
                  render={({ field }) => (
                    <FormItem className='grid grid-cols-6 items-center space-y-0 gap-x-4 gap-y-1'>
                      <FormLabel className='col-span-2 text-end'>
                        Nick Name
                      </FormLabel>
                      <FormControl>
                        <Input
                          placeholder='johnd'
                          className='col-span-4'
                          autoComplete='off'
                          {...field}
                        />
                      </FormControl>
                      <FormMessage className='col-span-4 col-start-3' />
                    </FormItem>
                  )}
                />
              )}
              <FormField
                control={form.control}
                name='email'
                render={({ field }) => (
                  <FormItem className='grid grid-cols-6 items-center space-y-0 gap-x-4 gap-y-1'>
                    <FormLabel className='col-span-2 text-end'>Email</FormLabel>
                    <FormControl>
                      <Input
                        placeholder='john.doe@gmail.com'
                        className='col-span-4'
                        disabled={isEdit}
                        {...field}
                      />
                    </FormControl>
                    <FormMessage className='col-span-4 col-start-3' />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name='role'
                render={({ field }) => (
                  <FormItem className='grid grid-cols-6 items-center space-y-0 gap-x-4 gap-y-1'>
                    <FormLabel className='col-span-2 text-end'>Role</FormLabel>
                    <SelectDropdown
                      defaultValue={field.value}
                      onValueChange={field.onChange}
                      placeholder='Select a role'
                      className='col-span-4'
                      items={assignableRoles.map(({ label, value }) => ({
                        label,
                        value,
                      }))}
                    />
                    <FormMessage className='col-span-4 col-start-3' />
                  </FormItem>
                )}
              />
              {!isEdit && (
                <>
                  <FormField
                    control={form.control}
                    name='password'
                    render={({ field }) => (
                      <FormItem className='grid grid-cols-6 items-center space-y-0 gap-x-4 gap-y-1'>
                        <FormLabel className='col-span-2 text-end'>
                          Password
                        </FormLabel>
                        <FormControl>
                          <PasswordInput
                            placeholder='e.g., S3cur3P@ssw0rd'
                            className='col-span-4'
                            {...field}
                          />
                        </FormControl>
                        <FormMessage className='col-span-4 col-start-3' />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name='confirmPassword'
                    render={({ field }) => (
                      <FormItem className='grid grid-cols-6 items-center space-y-0 gap-x-4 gap-y-1'>
                        <FormLabel className='col-span-2 text-end'>
                          Confirm Password
                        </FormLabel>
                        <FormControl>
                          <PasswordInput
                            disabled={!isPasswordTouched}
                            placeholder='e.g., S3cur3P@ssw0rd'
                            className='col-span-4'
                            {...field}
                          />
                        </FormControl>
                        <FormMessage className='col-span-4 col-start-3' />
                      </FormItem>
                    )}
                  />
                </>
              )}
            </form>
          </Form>
        </div>
        <DialogFooter>
          <Button type='submit' form='user-form' disabled={isPending}>
            Save changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
```

- [ ] **Step 4: Run test — must pass** (`pnpm test src/features/users/components/users-action-dialog.test.tsx`)

- [ ] **Step 5: Commit**

```bash
git add src/features/users/components/users-action-dialog.tsx src/features/users/components/users-action-dialog.test.tsx
git commit -m "feat(users): wire add/edit dialog to supabase mutations"
```

#### 7b. Invite dialog

- [ ] **Step 1: Rewrite the failing test** `users-invite-dialog.test.tsx`:

```tsx
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
```

- [ ] **Step 2: Run — must fail** (`pnpm test src/features/users/components/users-invite-dialog.test.tsx`)

- [ ] **Step 3: Rewrite `users-invite-dialog.tsx`** — drop the `desc` field, use `assignableRoles`, call `useInviteUser`:

```tsx
import { z } from 'zod'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { MailPlus, Send } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { SelectDropdown } from '@/components/select-dropdown'
import { assignableRoles } from '../data/data'
import {
  useInviteUser,
  type AssignableRole,
} from '../hooks/use-users-mutations'

const formSchema = z.object({
  email: z.email({
    error: (iss) =>
      iss.input === '' ? 'Please enter an email to invite.' : undefined,
  }),
  role: z.string().min(1, 'Role is required.'),
})

type UserInviteForm = z.infer<typeof formSchema>

type UserInviteDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function UsersInviteDialog({
  open,
  onOpenChange,
}: UserInviteDialogProps) {
  const inviteUser = useInviteUser()
  const form = useForm<UserInviteForm>({
    resolver: zodResolver(formSchema),
    defaultValues: { email: '', role: '' },
  })

  const onSubmit = async (values: UserInviteForm) => {
    try {
      await inviteUser.mutateAsync({
        email: values.email,
        role: values.role as AssignableRole,
      })
      toast.success('Invitation sent')
      form.reset()
      onOpenChange(false)
    } catch {
      // Error toast is shown by the global mutation onError handler.
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(state) => {
        form.reset()
        onOpenChange(state)
      }}
    >
      <DialogContent className='sm:max-w-md'>
        <DialogHeader className='text-start'>
          <DialogTitle className='flex items-center gap-2'>
            <MailPlus /> Invite User
          </DialogTitle>
          <DialogDescription>
            Invite new user to join your team by sending them an email
            invitation. Assign a role to define their access level.
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form
            id='user-invite-form'
            onSubmit={form.handleSubmit(onSubmit)}
            className='space-y-4'
          >
            <FormField
              control={form.control}
              name='email'
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Email</FormLabel>
                  <FormControl>
                    <Input
                      type='email'
                      placeholder='eg: john.doe@gmail.com'
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name='role'
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Role</FormLabel>
                  <SelectDropdown
                    defaultValue={field.value}
                    onValueChange={field.onChange}
                    placeholder='Select a role'
                    items={assignableRoles.map(({ label, value }) => ({
                      label,
                      value,
                    }))}
                  />
                  <FormMessage />
                </FormItem>
              )}
            />
          </form>
        </Form>
        <DialogFooter className='gap-y-2'>
          <DialogClose asChild>
            <Button variant='outline'>Cancel</Button>
          </DialogClose>
          <Button
            type='submit'
            form='user-invite-form'
            disabled={inviteUser.isPending}
          >
            Invite <Send />
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
```

- [ ] **Step 4: Run — must pass**, then commit:

```bash
git add src/features/users/components/users-invite-dialog.tsx src/features/users/components/users-invite-dialog.test.tsx
git commit -m "feat(users): wire invite dialog to admin-users edge function"
```

#### 7c. Delete dialog (single, self-delete guarded)

- [ ] **Step 1: Rewrite the failing test** `users-delete-dialog.test.tsx`:

```tsx
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

    await userEvent.fill(getByRole('textbox', { name: /Email/i }), SELF.email)
    await expect
      .element(getByRole('button', { name: /Delete/i }))
      .toBeDisabled()
    expect(deleteMutateAsync).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run — must fail**, then rewrite `users-delete-dialog.tsx`:

```tsx
'use client'

import { useState } from 'react'
import { AlertTriangle } from 'lucide-react'
import { toast } from 'sonner'
import { useAuthStore } from '@/stores/auth-store'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { type User } from '../data/schema'
import { useDeleteUser } from '../hooks/use-users-mutations'

type UserDeleteDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  currentRow: User
}

export function UsersDeleteDialog({
  open,
  onOpenChange,
  currentRow,
}: UserDeleteDialogProps) {
  const [value, setValue] = useState('')
  const authUser = useAuthStore((s) => s.user)
  const deleteUser = useDeleteUser()
  const isSelf = authUser?.id === currentRow.id

  const handleDelete = async () => {
    if (isSelf || value.trim() !== currentRow.email) return
    try {
      await deleteUser.mutateAsync(currentRow.id)
      toast.success('User deleted')
      onOpenChange(false)
    } catch {
      // Error toast is shown by the global mutation onError handler.
    }
  }

  return (
    <ConfirmDialog
      open={open}
      onOpenChange={onOpenChange}
      form='users-delete-form'
      disabled={
        isSelf || deleteUser.isPending || value.trim() !== currentRow.email
      }
      title={
        <span className='text-destructive'>
          <AlertTriangle
            className='me-1 inline-block stroke-destructive'
            size={18}
          />{' '}
          Delete User
        </span>
      }
      desc={
        <form
          id='users-delete-form'
          onSubmit={(e) => {
            e.preventDefault()
            void handleDelete()
          }}
          className='space-y-4'
        >
          <p className='mb-2'>
            Are you sure you want to delete{' '}
            <span className='font-bold'>
              {currentRow.displayName || currentRow.email}
            </span>
            ?
            <br />
            This action will permanently remove the user with the role of{' '}
            <span className='font-bold'>
              {currentRow.role.toUpperCase()}
            </span>{' '}
            from the system. This cannot be undone.
          </p>

          <Label className='my-2'>
            Email:
            <Input
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder='Enter email to confirm deletion.'
              disabled={isSelf}
              autoFocus
            />
          </Label>

          {isSelf ? (
            <Alert variant='destructive'>
              <AlertTitle>Not allowed</AlertTitle>
              <AlertDescription>
                You cannot delete your own account.
              </AlertDescription>
            </Alert>
          ) : (
            <Alert variant='destructive'>
              <AlertTitle>Warning!</AlertTitle>
              <AlertDescription>
                Please be careful, this operation can not be rolled back.
              </AlertDescription>
            </Alert>
          )}
        </form>
      }
      confirmText='Delete'
      destructive
    />
  )
}
```

- [ ] **Step 3: Run — must pass**, then commit:

```bash
git add src/features/users/components/users-delete-dialog.tsx src/features/users/components/users-delete-dialog.test.tsx
git commit -m "feat(users): wire delete dialog with self-delete guard"
```

#### 7d. Multi-delete dialog, bulk actions, row actions, test util

- [ ] **Step 1: Extend `createTableMock` in `src/test-utils/tanstack-table.tsx`** (check actual extension first) so rows can carry `original`:

```tsx
import { type Table } from '@tanstack/react-table'
import { vi } from 'vitest'

/**
 * Minimal TanStack Table mock for tests that only need selected rows and
 * `resetRowSelection` (e.g. multi-delete dialogs).
 */
export function createTableMock(rowCount = 2, originals?: unknown[]) {
  const rows = Array.from({ length: rowCount }, (_, i) => ({
    original: originals?.[i] ?? {},
  }))
  const resetRowSelection = vi.fn()
  const table = {
    getFilteredSelectedRowModel: () => ({ rows }),
    resetRowSelection,
  } as unknown as Table<Record<string, unknown>>
  return { table, resetRowSelection }
}
```

- [ ] **Step 2: Rewrite the failing test** `users-multi-delete-dialog.test.tsx`:

```tsx
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
    const withSelf = [{ id: 'self-admin-id', email: 'me@example.com' }, ...USERS]
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
```

- [ ] **Step 3: Run — must fail**, then rewrite `users-multi-delete-dialog.tsx`:

```tsx
'use client'

import { useState } from 'react'
import { type Table } from '@tanstack/react-table'
import { AlertTriangle } from 'lucide-react'
import { toast } from 'sonner'
import { useAuthStore } from '@/stores/auth-store'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { type User } from '../data/schema'
import { useDeleteUsers } from '../hooks/use-users-mutations'

type UserMultiDeleteDialogProps<TData> = {
  open: boolean
  onOpenChange: (open: boolean) => void
  table: Table<TData>
}

const CONFIRM_WORD = 'DELETE'

export function UsersMultiDeleteDialog<TData>({
  open,
  onOpenChange,
  table,
}: UserMultiDeleteDialogProps<TData>) {
  const [value, setValue] = useState('')
  const authUser = useAuthStore((s) => s.user)
  const deleteUsers = useDeleteUsers()

  const selectedUsers = table
    .getFilteredSelectedRowModel()
    .rows.map((row) => row.original as User)
  const deletableIds = selectedUsers
    .filter((u) => u.id !== authUser?.id)
    .map((u) => u.id)
  const excludesSelf = deletableIds.length !== selectedUsers.length

  const handleDelete = () => {
    if (value.trim() !== CONFIRM_WORD) {
      toast.error(`Please type "${CONFIRM_WORD}" to confirm.`)
      return
    }

    onOpenChange(false)

    toast.promise(
      deleteUsers.mutateAsync(deletableIds).then(() => {
        setValue('')
        table.resetRowSelection()
      }),
      {
        loading: 'Deleting users...',
        success: `Deleted ${deletableIds.length} ${
          deletableIds.length > 1 ? 'users' : 'user'
        }`,
        error: 'Failed to delete users',
      }
    )
  }

  return (
    <ConfirmDialog
      open={open}
      onOpenChange={onOpenChange}
      form='users-multi-delete-form'
      disabled={value.trim() !== CONFIRM_WORD || deletableIds.length === 0}
      title={
        <span className='text-destructive'>
          <AlertTriangle
            className='me-1 inline-block stroke-destructive'
            size={18}
          />{' '}
          Delete {deletableIds.length}{' '}
          {deletableIds.length > 1 ? 'users' : 'user'}
        </span>
      }
      desc={
        <form
          id='users-multi-delete-form'
          onSubmit={(e) => {
            e.preventDefault()
            handleDelete()
          }}
          className='space-y-4'
        >
          <p className='mb-2'>
            Are you sure you want to delete the selected users?{' '}
            {excludesSelf && (
              <span className='font-bold'>
                (your own account is excluded)
              </span>
            )}
            <br />
            This action cannot be undone.
          </p>

          <Label className='my-4 flex flex-col items-start gap-1.5'>
            <span className=''>Confirm by typing "{CONFIRM_WORD}":</span>
            <Input
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder={`Type "${CONFIRM_WORD}" to confirm.`}
              autoFocus
            />
          </Label>

          <Alert variant='destructive'>
            <AlertTitle>Warning!</AlertTitle>
            <AlertDescription>
              Please be careful, this operation can not be rolled back.
            </AlertDescription>
          </Alert>
        </form>
      }
      confirmText='Delete'
      destructive
    />
  )
}
```

- [ ] **Step 4: Trim `data-table-bulk-actions.tsx`** — the status/invite bulk buttons have no real backend; keep only delete:

```tsx
import { useState } from 'react'
import { type Table } from '@tanstack/react-table'
import { Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { DataTableBulkActions as BulkActionsToolbar } from '@/components/data-table'
import { UsersMultiDeleteDialog } from './users-multi-delete-dialog'

type DataTableBulkActionsProps<TData> = {
  table: Table<TData>
}

export function DataTableBulkActions<TData>({
  table,
}: DataTableBulkActionsProps<TData>) {
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)

  return (
    <>
      <BulkActionsToolbar table={table} entityName='user'>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant='destructive'
              size='icon'
              onClick={() => setShowDeleteConfirm(true)}
              className='size-8'
              aria-label='Delete selected users'
              title='Delete selected users'
            >
              <Trash2 />
              <span className='sr-only'>Delete selected users</span>
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            <p>Delete selected users</p>
          </TooltipContent>
        </Tooltip>
      </BulkActionsToolbar>

      <UsersMultiDeleteDialog
        table={table}
        open={showDeleteConfirm}
        onOpenChange={setShowDeleteConfirm}
      />
    </>
  )
}
```

- [ ] **Step 5: Guard self-delete in `data-table-row-actions.tsx`** — add after the existing imports and inside the component:

```tsx
import { useAuthStore } from '@/stores/auth-store'
```

```tsx
export function DataTableRowActions({ row }: DataTableRowActionsProps) {
  const { setOpen, setCurrentRow } = useUsers()
  const authUser = useAuthStore((s) => s.user)
  const isSelf = authUser?.id === row.original.id
```

and on the Delete menu item:

```tsx
          <DropdownMenuItem
            disabled={isSelf}
            onClick={() => {
              setCurrentRow(row.original)
              setOpen('delete')
            }}
            className='text-red-500!'
          >
```

- [ ] **Step 6: Run — must pass**, then commit:

```bash
pnpm test src/features/users/components/users-multi-delete-dialog.test.tsx
git add src/test-utils/ src/features/users/components/
git commit -m "feat(users): real bulk delete with self-exclusion, trim bulk actions"
```

---

### Task 8: Columns, table, page, route

**Files:**
- Rewrite: `src/features/users/components/users-columns.tsx`
- Rewrite: `src/features/users/components/users-table.tsx`
- Modify: `src/features/users/index.tsx`
- Modify: `src/routes/_authenticated/users/index.tsx`

- [ ] **Step 1: Rewrite `users-columns.tsx`**

```tsx
import { type ColumnDef } from '@tanstack/react-table'
import { cn } from '@/lib/utils'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { DataTableColumnHeader } from '@/components/data-table'
import { LongText } from '@/components/long-text'
import { roleColors, roles } from '../data/data'
import { type User } from '../data/schema'
import { DataTableRowActions } from './data-table-row-actions'

export const usersColumns: ColumnDef<User>[] = [
  {
    id: 'select',
    header: ({ table }) => (
      <Checkbox
        checked={
          table.getIsAllPageRowsSelected() ||
          (table.getIsSomePageRowsSelected() && 'indeterminate')
        }
        onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
        aria-label='Select all'
        className='translate-y-0.5'
      />
    ),
    meta: {
      className: cn('inset-s-0 z-10 rounded-tl-[inherit] max-md:sticky'),
    },
    cell: ({ row }) => (
      <Checkbox
        checked={row.getIsSelected()}
        onCheckedChange={(value) => row.toggleSelected(!!value)}
        aria-label='Select row'
        className='translate-y-0.5'
      />
    ),
    enableSorting: false,
    enableHiding: false,
  },
  {
    accessorKey: 'displayName',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title='Name' />
    ),
    cell: ({ row }) => {
      const { displayName, avatarUrl, email } = row.original
      return (
        <div className='flex items-center gap-x-2 ps-1'>
          <Avatar className='size-7'>
            {avatarUrl ? (
              <AvatarImage src={avatarUrl} alt={displayName} />
            ) : null}
            <AvatarFallback>
              {(displayName || email).charAt(0).toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <LongText className='max-w-36'>{displayName}</LongText>
        </div>
      )
    },
    meta: {
      className: cn(
        'drop-shadow-[0_1px_2px_rgb(0_0_0_/_0.1)] dark:drop-shadow-[0_1px_2px_rgb(255_255_255_/_0.1)]',
        'inset-s-6 ps-0.5 max-md:sticky @4xl/content:table-cell @4xl/content:drop-shadow-none'
      ),
    },
    enableSorting: false,
    enableHiding: false,
  },
  {
    accessorKey: 'nickName',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title='Nick Name' />
    ),
    cell: ({ row }) => (
      <LongText className='max-w-36'>{row.getValue('nickName')}</LongText>
    ),
    meta: { className: 'w-36' },
    enableSorting: false,
  },
  {
    accessorKey: 'email',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title='Email' />
    ),
    cell: ({ row }) => (
      <div className='w-fit ps-2 text-nowrap'>{row.getValue('email')}</div>
    ),
    enableSorting: false,
  },
  {
    accessorKey: 'role',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title='Role' />
    ),
    cell: ({ row }) => {
      const { role } = row.original
      const userType = roles.find(({ value }) => value === role)
      const badgeColor = roleColors.get(role)
      return (
        <div className='flex items-center gap-x-2'>
          {userType?.icon && (
            <userType.icon size={16} className='text-muted-foreground' />
          )}
          <Badge variant='outline' className={cn('capitalize', badgeColor)}>
            {role}
          </Badge>
        </div>
      )
    },
    enableSorting: false,
    enableHiding: false,
  },
  {
    accessorKey: 'createdAt',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title='Created' />
    ),
    cell: ({ row }) => (
      <div className='text-nowrap'>
        {row.original.createdAt.toLocaleDateString()}
      </div>
    ),
    enableSorting: false,
  },
  {
    id: 'actions',
    cell: DataTableRowActions,
  },
]
```

- [ ] **Step 2: Rewrite `users-table.tsx`** (manual pagination/filtering, fetches its own data — mirrors `full-tests-table.tsx`):

```tsx
import { useEffect, useMemo, useState } from 'react'
import {
  type ColumnFiltersState,
  type VisibilityState,
  flexRender,
  getCoreRowModel,
  useReactTable,
} from '@tanstack/react-table'
import { AlertCircle } from 'lucide-react'
import { cn } from '@/lib/utils'
import { type NavigateFn, useTableUrlState } from '@/hooks/use-table-url-state'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  DataTablePagination,
  DataTableToolbar,
  TableSkeleton,
} from '@/components/data-table'
import { roles } from '../data/data'
import { type UserRole } from '../data/schema'
import { useUsersData, type UsersFilters } from '../hooks/use-users-data'
import { DataTableBulkActions } from './data-table-bulk-actions'
import { usersColumns as columns } from './users-columns'

type UsersTableProps = {
  search: Record<string, unknown>
  navigate: NavigateFn
}

function getArray(filters: ColumnFiltersState, id: string): string[] {
  const found = filters.find((f) => f.id === id)
  return Array.isArray(found?.value) ? (found.value as string[]) : []
}

function getString(filters: ColumnFiltersState, id: string): string {
  const found = filters.find((f) => f.id === id)
  return typeof found?.value === 'string' ? (found.value as string) : ''
}

export function UsersTable({ search, navigate }: UsersTableProps) {
  const [rowSelection, setRowSelection] = useState({})
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({})

  // Synced with URL states (keys/defaults mirror users route search schema)
  const {
    columnFilters,
    onColumnFiltersChange,
    pagination,
    onPaginationChange,
    ensurePageInRange,
  } = useTableUrlState({
    search,
    navigate,
    pagination: { defaultPage: 1, defaultPageSize: 10 },
    globalFilter: { enabled: false },
    columnFilters: [
      { columnId: 'displayName', searchKey: 'search', type: 'string' },
      { columnId: 'role', searchKey: 'role', type: 'array' },
    ],
  })

  const filters: UsersFilters = useMemo(
    () => ({
      search: getString(columnFilters, 'displayName'),
      role: getArray(columnFilters, 'role') as UserRole[],
    }),
    [columnFilters]
  )

  const { data, count, isLoading, error, refetch } = useUsersData({
    pageIndex: pagination.pageIndex,
    pageSize: pagination.pageSize,
    filters,
  })

  const pageCount = Math.max(1, Math.ceil(count / pagination.pageSize))

  // eslint-disable-next-line react-hooks/incompatible-library
  const table = useReactTable({
    data,
    columns,
    state: {
      pagination,
      rowSelection,
      columnFilters,
      columnVisibility,
    },
    enableRowSelection: true,
    manualPagination: true,
    manualFiltering: true,
    pageCount,
    onPaginationChange,
    onColumnFiltersChange,
    onRowSelectionChange: setRowSelection,
    onColumnVisibilityChange: setColumnVisibility,
    getCoreRowModel: getCoreRowModel(),
  })

  useEffect(() => {
    ensurePageInRange(pageCount)
  }, [pageCount, ensurePageInRange])

  return (
    <div
      className={cn(
        'max-sm:has-[div[role="toolbar"]]:mb-16', // Add margin bottom to the table on mobile when the toolbar is visible
        'flex flex-1 flex-col gap-4'
      )}
    >
      <DataTableToolbar
        table={table}
        searchPlaceholder='Search by name or email...'
        searchKey='displayName'
        filters={[
          {
            columnId: 'role',
            title: 'Role',
            options: roles.map((role) => ({ ...role })),
          },
        ]}
      />

      {error ? (
        <Alert variant='destructive'>
          <AlertCircle />
          <AlertTitle>Failed to load users</AlertTitle>
          <AlertDescription>
            {error instanceof Error ? error.message : 'Unknown error'}
            <Button
              variant='outline'
              size='sm'
              className='mt-2'
              onClick={() => refetch()}
            >
              Retry
            </Button>
          </AlertDescription>
        </Alert>
      ) : (
        <div className='overflow-hidden rounded-md border'>
          {isLoading ? (
            <TableSkeleton columnCount={columns.length} />
          ) : (
            <Table>
              <TableHeader>
                {table.getHeaderGroups().map((headerGroup) => (
                  <TableRow key={headerGroup.id} className='group/row'>
                    {headerGroup.headers.map((header) => (
                      <TableHead
                        key={header.id}
                        colSpan={header.colSpan}
                        className={cn(
                          'bg-background group-hover/row:bg-muted group-data-[state=selected]/row:bg-muted',
                          header.column.columnDef.meta?.className,
                          header.column.columnDef.meta?.thClassName
                        )}
                      >
                        {header.isPlaceholder
                          ? null
                          : flexRender(
                              header.column.columnDef.header,
                              header.getContext()
                            )}
                      </TableHead>
                    ))}
                  </TableRow>
                ))}
              </TableHeader>
              <TableBody>
                {table.getRowModel().rows?.length ? (
                  table.getRowModel().rows.map((row) => (
                    <TableRow
                      key={row.id}
                      data-state={row.getIsSelected() && 'selected'}
                      className='group/row'
                    >
                      {row.getVisibleCells().map((cell) => (
                        <TableCell
                          key={cell.id}
                          className={cn(
                            'bg-background group-hover/row:bg-muted group-data-[state=selected]/row:bg-muted',
                            cell.column.columnDef.meta?.className,
                            cell.column.columnDef.meta?.tdClassName
                          )}
                        >
                          {flexRender(
                            cell.column.columnDef.cell,
                            cell.getContext()
                          )}
                        </TableCell>
                      ))}
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell
                      colSpan={columns.length}
                      className='h-24 text-center'
                    >
                      No results.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          )}
        </div>
      )}

      {!error && <DataTablePagination table={table} className='mt-auto' />}
      <DataTableBulkActions table={table} />
    </div>
  )
}
```

- [ ] **Step 3: Update `src/features/users/index.tsx`** — delete the `import { users } from './data/users'` line and change the table line to:

```tsx
        <UsersTable search={search} navigate={navigate} />
```

- [ ] **Step 4: Rewrite `src/routes/_authenticated/users/index.tsx`**

```tsx
import z from 'zod'
import { createFileRoute } from '@tanstack/react-router'
import { Users } from '@/features/users'
import { userRoleValues } from '@/features/users/data/schema'

const usersSearchSchema = z.object({
  page: z.number().optional().catch(1),
  pageSize: z.number().optional().catch(10),
  // Facet filters
  role: z.array(z.enum(userRoleValues)).optional().catch([]),
  // Text search over display name / nick name / email (server-side)
  search: z.string().optional().catch(''),
})

export const Route = createFileRoute('/_authenticated/users/')({
  validateSearch: usersSearchSchema,
  component: Users,
})
```

- [ ] **Step 5: Build must be green again**

```bash
pnpm lint && pnpm build
```

Expected: both pass. Fix any leftover references to removed exports (`callTypes`, old `User` fields) before proceeding.

- [ ] **Step 6: Commit**

```bash
git add src/features/users/ src/routes/_authenticated/users/index.tsx
git commit -m "feat(users): list users from user_profiles via admin RPC"
```

---

### Task 9: Full verification gate

- [ ] **Step 1: Ensure the E2E test user is an admin**

```bash
grep E2E_TEST_EMAIL /home/liuhao/Documents/personal-v2/toka-shadcn-admin/.env.local
```

Then with `mcp__supabase__execute_sql` (replace the email):

```sql
select u.email, p.role from public.user_profiles p
join auth.users u on u.id = p.id
where u.email = '<E2E_TEST_EMAIL value>';
```

If role is not `admin`:

```sql
update public.user_profiles p set role = 'admin'
from auth.users u
where u.id = p.id and u.email = '<E2E_TEST_EMAIL value>';
```

- [ ] **Step 2: Run the full gate**

```bash
pnpm lint && pnpm build && pnpm test
```

Expected: all pass (the whole vitest suite, not just users tests).

- [ ] **Step 3: Dead-code check**

```bash
pnpm knip
```

Expected: no new findings from this change. (`@faker-js/faker` is still used by other features' fixtures — only investigate if knip flags it.)

- [ ] **Step 4: Commit any fixes**

```bash
git add -A && git commit -m "chore(users): verification fixes" || echo "nothing to fix"
```

---

### Task 10: Live QA against the dev server

- [ ] **Step 1: Start the dev server** (`pnpm dev`, background) and sign in at `http://localhost:3000/sign-in` with `E2E_TEST_EMAIL` / `E2E_TEST_PASSWORD` from `.env.local`. Use the Playwright MCP tools (`mcp__plugin_ecc_playwright__*`) if available; otherwise ask the user to verify manually.

- [ ] **Step 2: Verify on `/users`:**
  1. The table shows the **3 real rows** (Hậu Lư, Toka Dev, supertoka) — not 500 faker rows.
  2. Search `toka` filters server-side (URL gets `?search=toka`).
  3. Role facet `Admin` shows only the 2 admins.
  4. **Edit**: change a user's nick name → toast "User updated", table refreshes with the new value.
  5. **Create**: Add User with a throwaway email (e.g. `qa-tmp+1@example.com`, password `S3cur3Pass1`) → appears in the table.
  6. **Delete**: delete that throwaway user (type its email to confirm) → row disappears.
  7. **Self-delete guard**: on your own row, the Delete menu item is disabled.
  8. Pagination: set page size 1 → 3 pages, navigation works.

- [ ] **Step 3: Verify DB state is clean** — with `mcp__supabase__execute_sql`: `select count(*) from public.user_profiles;` Expected: 3 (throwaway user removed).

- [ ] **Step 4: Resolve the originating annotation**

Call `mcp__agentation__agentation_resolve` with `annotationId: "mq1qlab6-wuzon8"` and a summary of what changed.

- [ ] **Step 5: Final commit & wrap-up**

```bash
git add -A && git commit -m "feat(users): finish wiring /users to supabase user_profiles" || true
git log --oneline develop..HEAD
```

Then use superpowers:finishing-a-development-branch to merge/PR. **Remind the user:** copy `supabase/migrations/20260606000000_admin_users_access.sql` into the Flyway repo (the canonical migration home).
