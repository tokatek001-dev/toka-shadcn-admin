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
