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
