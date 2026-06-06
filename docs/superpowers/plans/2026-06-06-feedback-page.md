# Feature Feedback ("Góp ý tính năng") Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A new admin page at `/feedback` listing user-submitted feedback from a new `user_feedback` table, with server-side pagination/search/status filter and per-row status changes (NOT_STARTED / IN_PROGRESS / COMPLETED).

**Architecture:** Per the approved spec (`docs/superpowers/specs/2026-06-06-feedback-page-design.md`): a new RLS-protected `user_feedback` table read directly via PostgREST with an embedded `user_profiles` join (Entry-style — no RPC, no edge function; reuses the existing `is_admin()` helper). Frontend mirrors the established server-driven table pattern from `src/features/users/`.

**Tech Stack:** Vite + React 19 + TS, TanStack Router/Query/Table, zod, supabase-js, vitest browser mode.

**Important constraints:**
- Supabase project ref `nuktewpnwemvmqdmxued`. Admin test user id `b37c0828-cd87-4983-86fb-ce94b24a9b24`; non-admin user id `8f962bcf-cfde-49a1-b59c-8b9d5768c656` (Hậu Lư). E2E sign-in user `supertoka@gmail.com` (admin) — creds in `.env.local`.
- **Work in a worktree** — parallel sessions share the main checkout. All file work happens in `.claude/worktrees/feedback-page`.
- `public.is_admin()` already exists (from the /users work). Do NOT recreate it.
- After applying SQL via MCP, the migration must also be copied to `python-mono-app/migrations/` (numbered series is canonical for `user_*` tables) — final task.
- Reference implementations to mirror: `src/features/users/components/users-table.tsx` (server-driven table with the `getRowId` + `!isLoading` page-clamp lessons), `src/features/entry/hooks/use-full-tests-data.ts` (direct PostgREST query hook), `src/features/users/components/users-action-dialog.test.tsx` (vi.hoisted mock pattern).
- Run `npx prettier --write <files>` on touched files before each commit (import sorter).
- MCP tools used: `mcp__supabase__apply_migration`, `mcp__supabase__execute_sql` (load via ToolSearch if needed).

---

### Task 1: Worktree + branch

- [ ] **Step 1: Create the worktree** (from the main checkout)

```bash
cd /home/liuhao/Documents/personal-v2/toka-shadcn-admin
git worktree add .claude/worktrees/feedback-page -b feature/feedback-page develop
cd .claude/worktrees/feedback-page
pnpm install
```

`pnpm install` is required — a fresh worktree has no `node_modules` (pnpm reuses the shared store, so it's fast). All subsequent tasks run from `.claude/worktrees/feedback-page`.

---

### Task 2: Database migration (`user_feedback` table)

**Files:**
- Create: `supabase/migrations/20260606120000_user_feedback.sql`

- [ ] **Step 1: Write the migration SQL file** with exactly:

```sql
-- user_feedback: feature feedback / bug reports submitted by app users,
-- triaged from the admin /feedback page.
-- NOTE: canonical home is python-mono-app/migrations/ — copy this file there.
-- Relies on public.is_admin() created by 20260606000000_admin_users_access.sql.

create table if not exists public.user_feedback (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.user_profiles(id) on delete cascade,
  content text not null,
  status text not null default 'NOT_STARTED'
    constraint user_feedback_status_check
    check (status in ('NOT_STARTED', 'IN_PROGRESS', 'COMPLETED')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists user_feedback_status_created_at_idx
  on public.user_feedback (status, created_at desc);

alter table public.user_feedback enable row level security;

-- Admins triage everything.
drop policy if exists "Admins can read all feedback" on public.user_feedback;
create policy "Admins can read all feedback"
  on public.user_feedback
  for select
  to authenticated
  using (public.is_admin());

drop policy if exists "Admins can update feedback" on public.user_feedback;
create policy "Admins can update feedback"
  on public.user_feedback
  for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- App users submit and see their own feedback (mobile app, later).
drop policy if exists "Users can submit their own feedback" on public.user_feedback;
create policy "Users can submit their own feedback"
  on public.user_feedback
  for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "Users can read their own feedback" on public.user_feedback;
create policy "Users can read their own feedback"
  on public.user_feedback
  for select
  to authenticated
  using (auth.uid() = user_id);
```

- [ ] **Step 2: Apply** — `mcp__supabase__apply_migration` with `name: "user_feedback"`, `query` = full file content.

- [ ] **Step 3: Verify the access matrix** — `mcp__supabase__execute_sql`, separate calls:

Insert a temp row as the postgres role (bypasses RLS, fine for seeding):

```sql
insert into public.user_feedback (user_id, content)
values ('8f962bcf-cfde-49a1-b59c-8b9d5768c656', 'QA: thêm chế độ tối cho app')
returning id, status;
```

Expected: one row, `status = 'NOT_STARTED'`. Note the returned id as `<FB_ID>`.

Admin sees it and can update:

```sql
begin;
select set_config('request.jwt.claims',
  '{"sub":"b37c0828-cd87-4983-86fb-ce94b24a9b24","role":"authenticated"}', true);
set local role authenticated;
select count(*) as admin_visible from public.user_feedback;
update public.user_feedback set status = 'IN_PROGRESS' where id = '<FB_ID>' returning status;
rollback;
```

Expected: `admin_visible = 1`; update returns `IN_PROGRESS` (then rolled back).

Owner (non-admin) sees their own row but cannot update it:

```sql
begin;
select set_config('request.jwt.claims',
  '{"sub":"8f962bcf-cfde-49a1-b59c-8b9d5768c656","role":"authenticated"}', true);
set local role authenticated;
select count(*) as owner_visible from public.user_feedback;
update public.user_feedback set status = 'COMPLETED' where id = '<FB_ID>' returning status;
rollback;
```

Expected: `owner_visible = 1`; the UPDATE affects **0 rows** (no admin policy, and the self policies don't include UPDATE).

CHECK constraint:

```sql
insert into public.user_feedback (user_id, content, status)
values ('8f962bcf-cfde-49a1-b59c-8b9d5768c656', 'x', 'BOGUS');
```

Expected: ERROR violating `user_feedback_status_check`.

Keep the `<FB_ID>` row — it doubles as live-QA data; it is deleted in the final task.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260606120000_user_feedback.sql
git commit -m "feat(db): user_feedback table with admin triage and self-submit RLS"
```

---

### Task 3: Feature data layer

**Files:**
- Create: `src/features/feedback/data/schema.ts`
- Create: `src/features/feedback/data/data.ts`

- [ ] **Step 1: Create `src/features/feedback/data/schema.ts`**

```ts
import { z } from 'zod'

export const feedbackStatusValues = [
  'NOT_STARTED',
  'IN_PROGRESS',
  'COMPLETED',
] as const
export type FeedbackStatus = (typeof feedbackStatusValues)[number]

// Rows come from PostgREST with an embedded user_profiles join (nullable if
// the profile is missing).
const feedbackRowSchema = z
  .object({
    id: z.string(),
    user_id: z.string(),
    content: z.string(),
    status: z.enum(feedbackStatusValues),
    created_at: z.coerce.date(),
    updated_at: z.coerce.date(),
    user_profiles: z
      .object({
        display_name: z.string().nullable(),
        avatar_url: z.string().nullable(),
      })
      .nullable(),
  })
  .transform((row) => ({
    id: row.id,
    userId: row.user_id,
    content: row.content,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    submitterName: row.user_profiles?.display_name ?? 'Unknown user',
    submitterAvatarUrl: row.user_profiles?.avatar_url ?? null,
  }))

export const feedbackRowsSchema = z.array(feedbackRowSchema)
export type Feedback = z.infer<typeof feedbackRowSchema>
```

- [ ] **Step 2: Create `src/features/feedback/data/data.ts`**

```ts
import { CircleCheck, CircleDashed, LoaderCircle } from 'lucide-react'
import { type FeedbackStatus } from './schema'

export const feedbackStatuses = [
  { label: 'Not Started', value: 'NOT_STARTED', icon: CircleDashed },
  { label: 'In Progress', value: 'IN_PROGRESS', icon: LoaderCircle },
  { label: 'Completed', value: 'COMPLETED', icon: CircleCheck },
] as const

export const feedbackStatusColors = new Map<FeedbackStatus, string>([
  ['NOT_STARTED', 'bg-neutral-300/40 border-neutral-300'],
  [
    'IN_PROGRESS',
    'bg-sky-200/40 text-sky-900 dark:text-sky-100 border-sky-300',
  ],
  [
    'COMPLETED',
    'bg-teal-100/30 text-teal-900 dark:text-teal-200 border-teal-200',
  ],
])
```

- [ ] **Step 3: Commit**

```bash
npx prettier --write src/features/feedback/data/
git add src/features/feedback/data/
git commit -m "feat(feedback): status values and row schema"
```

---

### Task 4: Hooks

**Files:**
- Create: `src/features/feedback/hooks/use-feedback-data.ts`
- Create: `src/features/feedback/hooks/use-feedback-mutations.ts`

- [ ] **Step 1: Create `src/features/feedback/hooks/use-feedback-data.ts`**

```ts
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import {
  feedbackRowsSchema,
  type Feedback,
  type FeedbackStatus,
} from '../data/schema'

export type FeedbackFilters = {
  search?: string
  status?: FeedbackStatus[]
}

type UseFeedbackDataParams = {
  pageIndex: number
  pageSize: number
  filters: FeedbackFilters
}

export const feedbackKeys = {
  all: ['feedback'] as const,
  list: (params: UseFeedbackDataParams) =>
    [...feedbackKeys.all, 'list', params] as const,
}

const FEEDBACK_SELECT =
  'id, user_id, content, status, created_at, updated_at, user_profiles(display_name, avatar_url)'

type FeedbackQueryResult = {
  rows: Feedback[]
  count: number
}

async function fetchFeedback({
  pageIndex,
  pageSize,
  filters,
}: UseFeedbackDataParams): Promise<FeedbackQueryResult> {
  const from = pageIndex * pageSize
  const to = from + pageSize - 1

  let query = supabase
    .from('user_feedback')
    .select(FEEDBACK_SELECT, { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(from, to)

  if (filters.search && filters.search.trim() !== '') {
    query = query.ilike('content', `%${filters.search.trim()}%`)
  }
  if (filters.status && filters.status.length > 0) {
    query = query.in('status', filters.status)
  }

  const { data, count, error } = await query

  if (error) {
    throw new Error(error.message)
  }

  const rows = feedbackRowsSchema.parse(data ?? [])
  return { rows, count: count ?? 0 }
}

export function useFeedbackData(params: UseFeedbackDataParams) {
  const query = useQuery({
    queryKey: feedbackKeys.list(params),
    queryFn: () => fetchFeedback(params),
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

- [ ] **Step 2: Create `src/features/feedback/hooks/use-feedback-mutations.ts`**

```ts
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { type FeedbackStatus } from '../data/schema'
import { feedbackKeys } from './use-feedback-data'

export function useUpdateFeedbackStatus() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: { id: string; status: FeedbackStatus }) => {
      const { data, error } = await supabase
        .from('user_feedback')
        .update({
          status: input.status,
          updated_at: new Date().toISOString(),
        })
        .eq('id', input.id)
        .select('id')
      if (error) throw new Error(error.message)
      if (!data || data.length === 0) {
        throw new Error('Feedback item not found')
      }
    },
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: feedbackKeys.all }),
  })
}
```

- [ ] **Step 3: Commit**

```bash
npx prettier --write src/features/feedback/hooks/
git add src/features/feedback/hooks/
git commit -m "feat(feedback): list query and status mutation hooks"
```

---

### Task 5: Status action component (TDD)

**Files:**
- Create: `src/features/feedback/components/feedback-status-action.test.tsx`
- Create: `src/features/feedback/components/feedback-status-action.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
import { type Row } from '@tanstack/react-table'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render } from 'vitest-browser-react'
import { userEvent } from 'vitest/browser'
import { type Feedback } from '../data/schema'
import { FeedbackStatusAction } from './feedback-status-action'

const { updateMutateAsync } = vi.hoisted(() => ({ updateMutateAsync: vi.fn() }))
updateMutateAsync.mockResolvedValue(undefined)

vi.mock('../hooks/use-feedback-mutations', () => ({
  useUpdateFeedbackStatus: () => ({
    mutateAsync: updateMutateAsync,
    isPending: false,
  }),
}))

const FEEDBACK: Feedback = {
  id: 'fb-1',
  userId: 'u-1',
  content: 'Please add dark mode',
  status: 'NOT_STARTED',
  createdAt: new Date('2026-06-01'),
  updatedAt: new Date('2026-06-01'),
  submitterName: 'Hậu Lư',
  submitterAvatarUrl: null,
}

const row = { original: FEEDBACK } as Row<Feedback>

describe('FeedbackStatusAction', () => {
  beforeEach(() => vi.clearAllMocks())

  it('shows the three statuses with the current one checked', async () => {
    const { getByRole } = await render(<FeedbackStatusAction row={row} />)

    await userEvent.click(getByRole('button', { name: /open menu/i }))

    await expect
      .element(getByRole('menuitemradio', { name: /not started/i }))
      .toBeChecked()
    await expect
      .element(getByRole('menuitemradio', { name: /in progress/i }))
      .toBeInTheDocument()
    await expect
      .element(getByRole('menuitemradio', { name: /completed/i }))
      .toBeInTheDocument()
  })

  it('updates the status when another option is chosen', async () => {
    const { getByRole } = await render(<FeedbackStatusAction row={row} />)

    await userEvent.click(getByRole('button', { name: /open menu/i }))
    await userEvent.click(getByRole('menuitemradio', { name: /in progress/i }))

    await vi.waitFor(() => expect(updateMutateAsync).toHaveBeenCalledOnce())
    expect(updateMutateAsync).toHaveBeenCalledWith({
      id: 'fb-1',
      status: 'IN_PROGRESS',
    })
  })

  it('does nothing when the current status is re-selected', async () => {
    const { getByRole } = await render(<FeedbackStatusAction row={row} />)

    await userEvent.click(getByRole('button', { name: /open menu/i }))
    await userEvent.click(getByRole('menuitemradio', { name: /not started/i }))

    expect(updateMutateAsync).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run it — must fail** (component doesn't exist):
`pnpm test src/features/feedback/components/feedback-status-action.test.tsx`

- [ ] **Step 3: Create `src/features/feedback/components/feedback-status-action.tsx`**

```tsx
import { DotsHorizontalIcon } from '@radix-ui/react-icons'
import { type Row } from '@tanstack/react-table'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { feedbackStatuses } from '../data/data'
import { type Feedback, type FeedbackStatus } from '../data/schema'
import { useUpdateFeedbackStatus } from '../hooks/use-feedback-mutations'

type FeedbackStatusActionProps = {
  row: Row<Feedback>
}

export function FeedbackStatusAction({ row }: FeedbackStatusActionProps) {
  const updateStatus = useUpdateFeedbackStatus()

  const handleChange = async (value: string) => {
    if (value === row.original.status) return
    try {
      await updateStatus.mutateAsync({
        id: row.original.id,
        status: value as FeedbackStatus,
      })
      toast.success('Status updated')
    } catch {
      // Error toast is shown by the global mutation onError handler.
    }
  }

  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <Button
          variant='ghost'
          className='flex h-8 w-8 p-0 data-[state=open]:bg-muted'
          disabled={updateStatus.isPending}
        >
          <DotsHorizontalIcon className='h-4 w-4' />
          <span className='sr-only'>Open menu</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align='end' className='w-44'>
        <DropdownMenuLabel>Set status</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuRadioGroup
          value={row.original.status}
          onValueChange={(value) => void handleChange(value)}
        >
          {feedbackStatuses.map(({ label, value }) => (
            <DropdownMenuRadioItem key={value} value={value}>
              {label}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
```

- [ ] **Step 4: Run the test — must pass** (3/3). If a failure is a locator/timing subtlety rather than a behavior gap, minimally adjust the test keeping its intent, and note it.

- [ ] **Step 5: Commit**

```bash
npx prettier --write src/features/feedback/components/
git add src/features/feedback/components/
git commit -m "feat(feedback): per-row status action with radio menu"
```

---

### Task 6: Columns, table, page

**Files:**
- Create: `src/features/feedback/components/feedback-columns.tsx`
- Create: `src/features/feedback/components/feedback-table.tsx`
- Create: `src/features/feedback/index.tsx`

- [ ] **Step 1: Create `src/features/feedback/components/feedback-columns.tsx`**

```tsx
import { type ColumnDef } from '@tanstack/react-table'
import { cn } from '@/lib/utils'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { DataTableColumnHeader } from '@/components/data-table'
import { LongText } from '@/components/long-text'
import { feedbackStatusColors, feedbackStatuses } from '../data/data'
import { type Feedback } from '../data/schema'
import { FeedbackStatusAction } from './feedback-status-action'

export const feedbackColumns: ColumnDef<Feedback>[] = [
  {
    id: 'submitter',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title='User' />
    ),
    cell: ({ row }) => {
      const { submitterName, submitterAvatarUrl } = row.original
      return (
        <div className='flex items-center gap-x-2 ps-1'>
          <Avatar className='size-7'>
            {submitterAvatarUrl ? (
              <AvatarImage src={submitterAvatarUrl} alt={submitterName} />
            ) : null}
            <AvatarFallback>
              {submitterName.charAt(0).toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <LongText className='max-w-36'>{submitterName}</LongText>
        </div>
      )
    },
    meta: { className: 'w-44' },
    enableSorting: false,
    enableHiding: false,
  },
  {
    accessorKey: 'content',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title='Feedback' />
    ),
    cell: ({ row }) => (
      <LongText className='max-w-md'>{row.getValue('content')}</LongText>
    ),
    enableSorting: false,
    enableHiding: false,
  },
  {
    accessorKey: 'status',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title='Status' />
    ),
    cell: ({ row }) => {
      const { status } = row.original
      const statusDef = feedbackStatuses.find((s) => s.value === status)
      return (
        <div className='flex items-center gap-x-2'>
          {statusDef?.icon && (
            <statusDef.icon size={16} className='text-muted-foreground' />
          )}
          <Badge
            variant='outline'
            className={cn(feedbackStatusColors.get(status))}
          >
            {statusDef?.label ?? status}
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
      <DataTableColumnHeader column={column} title='Submitted' />
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
    cell: FeedbackStatusAction,
  },
]
```

- [ ] **Step 2: Create `src/features/feedback/components/feedback-table.tsx`**

(Mirror of `users-table.tsx` without row selection / bulk actions; keeps the `getRowId` and `!isLoading` page-clamp fixes.)

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
import { feedbackStatuses } from '../data/data'
import { type FeedbackStatus } from '../data/schema'
import {
  useFeedbackData,
  type FeedbackFilters,
} from '../hooks/use-feedback-data'
import { feedbackColumns as columns } from './feedback-columns'

type FeedbackTableProps = {
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

export function FeedbackTable({ search, navigate }: FeedbackTableProps) {
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({})

  // Synced with URL states (keys/defaults mirror the feedback route schema)
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
      { columnId: 'content', searchKey: 'search', type: 'string' },
      { columnId: 'status', searchKey: 'status', type: 'array' },
    ],
  })

  const filters: FeedbackFilters = useMemo(
    () => ({
      search: getString(columnFilters, 'content'),
      status: getArray(columnFilters, 'status') as FeedbackStatus[],
    }),
    [columnFilters]
  )

  const { data, count, isLoading, error, refetch } = useFeedbackData({
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
      columnFilters,
      columnVisibility,
    },
    getRowId: (row) => row.id,
    manualPagination: true,
    manualFiltering: true,
    pageCount,
    onPaginationChange,
    onColumnFiltersChange,
    onColumnVisibilityChange: setColumnVisibility,
    getCoreRowModel: getCoreRowModel(),
  })

  useEffect(() => {
    // Skip while the first load is in flight: count is still 0 then, and
    // clamping against that would bounce a bookmarked ?page=N back to 1.
    if (!isLoading) {
      ensurePageInRange(pageCount)
    }
  }, [isLoading, pageCount, ensurePageInRange])

  return (
    <div className='flex flex-1 flex-col gap-4'>
      <DataTableToolbar
        table={table}
        searchPlaceholder='Search feedback...'
        searchKey='content'
        filters={[
          {
            columnId: 'status',
            title: 'Status',
            options: feedbackStatuses.map((status) => ({ ...status })),
          },
        ]}
      />

      {error ? (
        <Alert variant='destructive'>
          <AlertCircle />
          <AlertTitle>Failed to load feedback</AlertTitle>
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
                          'bg-background group-hover/row:bg-muted',
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
                    <TableRow key={row.id} className='group/row'>
                      {row.getVisibleCells().map((cell) => (
                        <TableCell
                          key={cell.id}
                          className={cn(
                            'bg-background group-hover/row:bg-muted',
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
    </div>
  )
}
```

- [ ] **Step 3: Create `src/features/feedback/index.tsx`**

```tsx
import { getRouteApi } from '@tanstack/react-router'
import { ConfigDrawer } from '@/components/config-drawer'
import { Header } from '@/components/layout/header'
import { LanguageSwitch } from '@/components/layout/language-switch'
import { Main } from '@/components/layout/main'
import { ProfileDropdown } from '@/components/profile-dropdown'
import { Search } from '@/components/search'
import { ThemeSwitch } from '@/components/theme-switch'
import { FeedbackTable } from './components/feedback-table'

const route = getRouteApi('/_authenticated/feedback/')

export function Feedback() {
  const search = route.useSearch()
  const navigate = route.useNavigate()

  return (
    <>
      <Header fixed>
        <Search className='me-auto' />
        <LanguageSwitch />
        <ThemeSwitch />
        <ConfigDrawer />
        <ProfileDropdown />
      </Header>

      <Main className='flex flex-1 flex-col gap-4 sm:gap-6'>
        <div className='flex flex-wrap items-end justify-between gap-2'>
          <div>
            <h2 className='text-2xl font-bold tracking-tight'>
              Feature Feedback
            </h2>
            <p className='text-muted-foreground'>
              Feedback and bug reports submitted by app users.
            </p>
          </div>
        </div>
        <FeedbackTable search={search} navigate={navigate} />
      </Main>
    </>
  )
}
```

- [ ] **Step 4: Commit** (build still red until the route exists in Task 7 — expected; the `getRouteApi('/_authenticated/feedback/')` id only typechecks after routeTree regenerates)

```bash
npx prettier --write src/features/feedback/
git add src/features/feedback/
git commit -m "feat(feedback): server-driven feedback table and page"
```

---

### Task 7: Route, sidebar, i18n — build green

**Files:**
- Create: `src/routes/_authenticated/feedback/index.tsx`
- Modify: `src/components/layout/data/sidebar-data.ts` (General group, after the Users item; add icon import)
- Modify: `src/locales/en/common.json`, `src/locales/vi/common.json` (nav.items)

- [ ] **Step 1: Create `src/routes/_authenticated/feedback/index.tsx`**

```tsx
import z from 'zod'
import { createFileRoute } from '@tanstack/react-router'
import { Feedback } from '@/features/feedback'
import { feedbackStatusValues } from '@/features/feedback/data/schema'

const feedbackSearchSchema = z.object({
  page: z.number().optional().catch(1),
  pageSize: z.number().optional().catch(10),
  // Facet filter
  status: z.array(z.enum(feedbackStatusValues)).optional().catch([]),
  // Text search over feedback content (server-side)
  search: z.string().optional().catch(''),
})

export const Route = createFileRoute('/_authenticated/feedback/')({
  validateSearch: feedbackSearchSchema,
  component: Feedback,
})
```

- [ ] **Step 2: Sidebar item** — in `src/components/layout/data/sidebar-data.ts`, add `MessageSquareHeart` to the lucide-react import list, and insert after the Users item in the General group:

```ts
        {
          title: 'Feature Feedback',
          url: '/feedback',
          icon: MessageSquareHeart,
        },
```

- [ ] **Step 3: i18n** — in BOTH locale files, inside `nav.items`, add a comma after the `"Help Center"` line and append:

`src/locales/en/common.json`:
```json
      "Feature Feedback": "Feature Feedback"
```

`src/locales/vi/common.json`:
```json
      "Feature Feedback": "Góp ý tính năng"
```

- [ ] **Step 4: Lint + build — both must pass** (build regenerates `src/routeTree.gen.ts`; never edit it by hand)

```bash
pnpm lint && pnpm build
```

- [ ] **Step 5: Run the feedback tests** — `pnpm test src/features/feedback/` → 3/3 pass.

- [ ] **Step 6: Commit**

```bash
npx prettier --write src/routes/_authenticated/feedback/index.tsx src/components/layout/data/sidebar-data.ts
git add src/routes/_authenticated/feedback/ src/components/layout/data/sidebar-data.ts src/locales/ src/routeTree.gen.ts
git commit -m "feat(feedback): route, sidebar entry and i18n labels"
```

---

### Task 8: Verification gate + live QA

- [ ] **Step 1: Full gate** (from the worktree)

```bash
pnpm lint && pnpm build && pnpm test
```

Expected: lint passes (1 pre-existing warning in `oauth.callback.tsx`); build passes; all tests pass EXCEPT the pre-existing `src/context/search-provider.test.tsx` failure (it fails identically on develop — do not chase it).

- [ ] **Step 2: Live QA** — the Task 2 seed row (`QA: thêm chế độ tối cho app`, submitted by Hậu Lư) is still in the table. Start `pnpm dev` (background, port 3000) in the worktree. Check for Playwright MCP tools (`mcp__plugin_playwright_playwright__*` per CLAUDE.md) via ToolSearch; if absent, write a throwaway Playwright script (repo-root `qa-feedback-ui.mjs`, delete afterwards) following the same approach used for the /users QA. Verify, signing in with `E2E_TEST_EMAIL`/`E2E_TEST_PASSWORD` from `.env.local`:
  1. Sidebar shows "Feature Feedback" (EN) → click → `/feedback`.
  2. Table lists the seed row with submitter "Hậu Lư", content, status badge "Not Started", date.
  3. Search `chế độ` → row remains; search `zzz` → "No results."; clear.
  4. Status facet `In Progress` → empty; clear.
  5. Row action → "Set status" → choose "In Progress" → toast + badge becomes "In Progress".
  6. Verify in DB (`mcp__supabase__execute_sql`): `select status from public.user_feedback;` → `IN_PROGRESS`.
  7. Switch language to VN (language switcher) → sidebar item reads "Góp ý tính năng".
  8. Screenshot to /tmp.
- [ ] **Step 3: Cleanup** — delete the seed row: `delete from public.user_feedback;` (via execute_sql; expect 1 row). Kill the dev server, delete any QA script, `git status --porcelain` clean.

- [ ] **Step 4: Commit any fixes** that came out of QA.

---

### Task 9: Merge, push, backend copy, resolve annotations

- [ ] **Step 1: Merge to develop** (from the MAIN checkout, not the worktree)

```bash
cd /home/liuhao/Documents/personal-v2/toka-shadcn-admin
git checkout develop && git pull origin develop
git merge feature/feedback-page
pnpm build
git push origin develop
```

If `git pull` brought new commits, re-run `pnpm lint && pnpm build && pnpm test src/features/feedback/` before pushing.

- [ ] **Step 2: Clean up the worktree**

```bash
git worktree remove .claude/worktrees/feedback-page
git worktree prune
git branch -d feature/feedback-page
```

- [ ] **Step 3: Copy the migration to the backend repo** — check the next free number first (`ls /home/liuhao/Documents/personal-v2/python-mono-app/migrations/ | tail -3`; expected next: `0033`). Create `python-mono-app/migrations/0033_user_feedback.sql` with the same SQL as Task 2 wrapped in the house style:
  - Header comment: filename, "Source: toka-shadcn-admin /feedback page", note "already applied to the live project via the Supabase MCP on 2026-06-06; idempotent (create table/index if not exists, drop policy if exists) — safe to re-apply", and "relies on public.is_admin() from 0032_admin_users_access.sql".
  - Body wrapped in `BEGIN;` / `COMMIT;`.
  - Then in python-mono-app: `git pull --rebase origin develop`, commit as `feat(db): user_feedback table for feature feedback triage (0033)`, push.

- [ ] **Step 4: Resolve the annotations** — `mcp__agentation__agentation_resolve` for `mq1vi1mc-f3fkii` and `mq1vi1qa-27fww2` with a summary of the new page.
