-- Lets admins view and post into any team's peer circle board, with their
-- posts marked so participants can tell a reply came from a facilitator.
-- Run once in the Supabase SQL Editor. Safe on an existing database.

alter table public.peer_posts add column is_facilitator_post boolean not null default false;

drop policy if exists "peer_posts: insert own team" on public.peer_posts;
create policy "peer_posts: insert own team" on public.peer_posts
  for insert with check (
    participant_id = auth.uid()
    and team_id in (select team_id from public.profiles where id = auth.uid())
    and is_facilitator_post is not true
  );

-- The existing "peer_posts: admin write" policy (for all using is_admin())
-- already lets admins select/insert into any team regardless of their own
-- team_id, so no further policy changes are needed for admin access itself.
