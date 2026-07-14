-- Adds pre-invite support so an admin can assign a batch/team to someone's
-- email BEFORE they ever sign in — their profile is created already
-- assigned, instead of landing on an empty "not assigned yet" screen.
-- Run this once in the Supabase SQL Editor. Safe on an existing database
-- with real participants/submissions — nothing existing is touched.

create table public.invited_participants (
  email text primary key,
  full_name text,
  cohort_id uuid references public.cohorts (id) on delete set null,
  team_id uuid references public.teams (id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.invited_participants enable row level security;

create policy "invited_participants: admin only" on public.invited_participants
  for all using (public.is_admin()) with check (public.is_admin());

-- Replaces the existing signup trigger function to also consume a matching
-- invite row, if one exists, when creating the new profile.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  invite public.invited_participants%rowtype;
begin
  select * into invite from public.invited_participants where email = new.email;

  insert into public.profiles (id, email, full_name, cohort_id, team_id)
  values (new.id, new.email, invite.full_name, invite.cohort_id, invite.team_id);

  if invite.email is not null then
    delete from public.invited_participants where email = invite.email;
  end if;

  return new;
end;
$$;
