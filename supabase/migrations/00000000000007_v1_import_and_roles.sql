-- ============================================================================
-- v1.0 / Migration 7 — Import review flags + role-gated signups
--
--   * events.needs_attention — set by the Import center when an event arrives
--     without a time and/or category (e.g. parsed from a calendar screenshot).
--     Rendered with a red outline until reviewed; cleared when an editor saves
--     the event with a category assigned.
--   * list_unassigned_profiles() — lets a household Owner/Admin see people who
--     signed up but have no role yet ("waiting room" flow).
--   * add_member_by_id() — assign a role to a pending signup in one click.
-- ============================================================================

alter table public.events
  add column needs_attention boolean not null default false;

-- Partial index: the attention list stays cheap to query.
create index idx_events_attention on public.events (household_id)
  where needs_attention and deleted_at is null;

-- ---------------------------------------------------------------------------
-- Pending signups: profiles that belong to NO household yet.
-- SECURITY DEFINER; callable only by someone who is Owner/Admin of at least
-- one household (fine for a private family deployment where every signup is
-- expected to be family).
-- ---------------------------------------------------------------------------
create or replace function public.list_unassigned_profiles()
returns table (id uuid, email text, display_name text, created_at timestamptz)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.household_members m
    where m.user_id = auth.uid()
      and m.status = 'active'
      and m.role in ('owner', 'admin')
  ) then
    raise exception 'not_authorized';
  end if;

  return query
  select p.id, p.email, p.display_name, p.created_at
  from public.profiles p
  where not exists (
    select 1 from public.household_members m
    where m.user_id = p.id and m.status = 'active'
  )
  order by p.created_at desc;
end;
$$;

revoke all on function public.list_unassigned_profiles() from public;
grant execute on function public.list_unassigned_profiles() to authenticated;

-- ---------------------------------------------------------------------------
-- Assign a role to a pending signup.
-- ---------------------------------------------------------------------------
create or replace function public.add_member_by_id(
  p_household uuid,
  p_user      uuid,
  p_role      public.household_role default 'user'
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.member_role(p_household) not in ('owner', 'admin') then
    raise exception 'not_authorized';
  end if;
  if p_role = 'owner' then
    raise exception 'cannot_grant_owner';
  end if;

  insert into public.household_members (household_id, user_id, role, status, invited_by)
  values (p_household, p_user, p_role, 'active', auth.uid())
  on conflict (household_id, user_id)
  do update set role = excluded.role, status = 'active';
end;
$$;

revoke all on function public.add_member_by_id(uuid, uuid, public.household_role) from public;
grant execute on function public.add_member_by_id(uuid, uuid, public.household_role) to authenticated;
