-- Celebrate You Hub — database schema
-- Paste this whole file into the Supabase SQL Editor (Project → SQL Editor → New query) and run it once.

-- ============================================================
-- TABLES
-- ============================================================

-- A class batch/run of the programme. Each has its own start date, so the
-- "current week" is worked out per participant from their own cohort
-- instead of one global date baked into the frontend.
create table public.cohorts (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  start_date date not null,
  created_at timestamptz not null default now()
);

-- A peer circle belongs to exactly one batch (a participant's team and
-- cohort must match — enforced by a trigger below) so a team never spans
-- people who are on different weeks of the programme.
create table public.teams (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  cohort_id uuid references public.cohorts (id) on delete cascade,
  created_at timestamptz not null default now()
);

-- One row per participant, extending Supabase's built-in auth.users.
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  full_name text,
  team_id uuid references public.teams (id) on delete set null,
  cohort_id uuid references public.cohorts (id) on delete set null,
  is_admin boolean not null default false,
  created_at timestamptz not null default now()
);

-- Read-only reference data: the 8 weeks of nudge content.
create table public.weekly_content (
  week_number int primary key,
  title text not null,
  domain text not null,
  insight text not null,
  reflection_prompts jsonb not null,   -- array of question strings
  challenge text not null,
  peer_circle_prompt text not null
);

-- Participant submissions, one per participant per week.
create table public.submissions (
  id uuid primary key default gen_random_uuid(),
  participant_id uuid not null references public.profiles (id) on delete cascade,
  week_number int not null references public.weekly_content (week_number),
  reflection_answers jsonb not null,   -- array of answer strings, same order as reflection_prompts
  challenge_status text not null default 'in_progress', -- 'completed' | 'partial' | 'not_started'
  challenge_notes text,
  question_for_facilitator text,       -- optional free-form question the participant wants answered
  submitted_at timestamptz not null default now(),
  unique (participant_id, week_number)
);

-- AI-drafted feedback, queued for admin review before the participant sees it.
create table public.feedback_queue (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references public.submissions (id) on delete cascade,
  participant_id uuid not null references public.profiles (id) on delete cascade,
  ai_draft text,
  final_feedback text,
  suggested_next_steps text,
  status text not null default 'pending', -- 'pending' | 'approved' | 'sent'
  admin_notes text,
  reviewed_by uuid references public.profiles (id),
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);

-- Private team (peer circle) board.
create table public.peer_posts (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams (id) on delete cascade,
  participant_id uuid not null references public.profiles (id) on delete cascade,
  author_name text not null,   -- denormalised at insert time so teammates don't need read access to each other's profile row
  is_facilitator_post boolean not null default false,  -- set only via admin write; lets participants tell a reply came from staff
  week_number int references public.weekly_content (week_number),
  content text not null,
  created_at timestamptz not null default now()
);

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================

alter table public.teams enable row level security;
alter table public.cohorts enable row level security;
alter table public.profiles enable row level security;
alter table public.weekly_content enable row level security;
alter table public.submissions enable row level security;
alter table public.feedback_queue enable row level security;
alter table public.peer_posts enable row level security;

-- Helper: is the current user an admin?
create or replace function public.is_admin()
returns boolean
language sql
security definer
stable
as $$
  select coalesce((select is_admin from public.profiles where id = auth.uid()), false);
$$;

-- teams: members can see their own team; admins see all.
create policy "teams: select own or admin" on public.teams
  for select using (
    id in (select team_id from public.profiles where id = auth.uid())
    or public.is_admin()
  );
create policy "teams: admin write" on public.teams
  for all using (public.is_admin()) with check (public.is_admin());

-- cohorts: members can see their own cohort; admins see all.
create policy "cohorts: select own or admin" on public.cohorts
  for select using (
    id in (select cohort_id from public.profiles where id = auth.uid())
    or public.is_admin()
  );
create policy "cohorts: admin write" on public.cohorts
  for all using (public.is_admin()) with check (public.is_admin());

-- profiles: everyone can see their own row; admins see all; users can update their own row
-- (a trigger below stops non-admins from changing team_id/cohort_id/is_admin on themselves).
create policy "profiles: select own or admin" on public.profiles
  for select using (id = auth.uid() or public.is_admin());
create policy "profiles: update own" on public.profiles
  for update using (id = auth.uid()) with check (id = auth.uid());
create policy "profiles: admin write" on public.profiles
  for all using (public.is_admin()) with check (public.is_admin());
create policy "profiles: insert own" on public.profiles
  for insert with check (id = auth.uid());

-- Stops a participant from self-assigning a team/cohort or granting themselves
-- admin by calling the profiles update endpoint directly (RLS above only
-- restricts *which row*, not *which columns*, a non-admin can update).
create or replace function public.protect_profile_privilege_columns()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- auth.uid() is only set for requests made through Supabase's normal
  -- client/API with a logged-in session (the app). Direct database access
  -- (SQL Editor, Table Editor, service_role key) has no auth.uid() and is
  -- already fully trusted, so this check only needs to stop a signed-in
  -- non-admin participant from self-escalating via the app.
  if auth.uid() is not null and not public.is_admin() then
    if new.is_admin is distinct from old.is_admin
       or new.team_id is distinct from old.team_id
       or new.cohort_id is distinct from old.cohort_id then
      raise exception 'Only an admin can change is_admin, team_id or cohort_id';
    end if;
  end if;
  return new;
end;
$$;

create trigger protect_profile_privilege_columns
  before update on public.profiles
  for each row execute procedure public.protect_profile_privilege_columns();

-- Stops a participant being assigned to a team that belongs to a different
-- batch than their own cohort (teams with no cohort_id set are treated as
-- unscoped/legacy and skip this check).
create or replace function public.validate_profile_team_cohort()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  team_cohort uuid;
begin
  if new.team_id is not null then
    select cohort_id into team_cohort from public.teams where id = new.team_id;
    if team_cohort is not null and new.cohort_id is distinct from team_cohort then
      raise exception 'This team belongs to a different batch than the participant''s assigned batch';
    end if;
  end if;
  return new;
end;
$$;

create trigger validate_profile_team_cohort
  before insert or update on public.profiles
  for each row execute procedure public.validate_profile_team_cohort();

-- weekly_content: readable by any signed-in participant.
create policy "weekly_content: read all authenticated" on public.weekly_content
  for select using (auth.role() = 'authenticated');
create policy "weekly_content: admin write" on public.weekly_content
  for all using (public.is_admin()) with check (public.is_admin());

-- submissions: participants manage their own; admins see/manage all.
create policy "submissions: select own or admin" on public.submissions
  for select using (participant_id = auth.uid() or public.is_admin());
create policy "submissions: insert own" on public.submissions
  for insert with check (participant_id = auth.uid());
create policy "submissions: update own" on public.submissions
  for update using (participant_id = auth.uid()) with check (participant_id = auth.uid());
create policy "submissions: admin write" on public.submissions
  for all using (public.is_admin()) with check (public.is_admin());

-- feedback_queue: participants only ever see rows once status = 'sent'; admins see everything.
create policy "feedback_queue: select sent-own or admin" on public.feedback_queue
  for select using (
    (participant_id = auth.uid() and status = 'sent')
    or public.is_admin()
  );
create policy "feedback_queue: admin write" on public.feedback_queue
  for all using (public.is_admin()) with check (public.is_admin());

-- peer_posts: team members can read/post within their own team; admins see all.
create policy "peer_posts: select own team or admin" on public.peer_posts
  for select using (
    team_id in (select team_id from public.profiles where id = auth.uid())
    or public.is_admin()
  );
create policy "peer_posts: insert own team" on public.peer_posts
  for insert with check (
    participant_id = auth.uid()
    and team_id in (select team_id from public.profiles where id = auth.uid())
    and is_facilitator_post is not true
  );
create policy "peer_posts: admin write" on public.peer_posts
  for all using (public.is_admin()) with check (public.is_admin());

-- ============================================================
-- PRE-INVITING PARTICIPANTS (assign a batch/team before first login)
-- ============================================================

-- Admin stages an invite here (email + batch + team) before the person has
-- ever signed in. The signup trigger below consumes a matching row so their
-- profile is created already assigned, instead of landing on an empty
-- "not assigned yet" screen on their first login.
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

-- ============================================================
-- AUTO-CREATE PROFILE ON SIGNUP
-- ============================================================

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

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();
