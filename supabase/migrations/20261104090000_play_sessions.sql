-- ─── Play sessions — every round started, arcade or real — 2026-11-04 ───────
-- A round that was started is a fact worth more than a round that was
-- finished: it is what a sponsor or an advertiser asks for first. The app
-- writes one row the moment a round begins (arcade or Clocked), and closes
-- it on completion or abandonment. Completed rows link to the posted score
-- or the saved round.
--
--   play_sessions         one row per start
--   admin_play_stats()    totals + per-player table, admin only

create table if not exists public.play_sessions (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references public.profiles(id) on delete cascade,
  kind             text not null check (kind in ('arcade', 'clocked')),
  difficulty       text,
  started_at       timestamptz not null default now(),
  ended_at         timestamptz,
  outcome          text check (outcome in ('completed', 'abandoned')),
  holes_planned    int,
  holes_completed  int,
  course_name      text,
  players          int,
  seed             text,
  challenge_id     uuid,
  score_id         uuid,
  round_id         uuid,
  app_version      text,
  meta             jsonb
);
create index if not exists play_sessions_user_started_idx on public.play_sessions (user_id, started_at desc);
create index if not exists play_sessions_kind_started_idx on public.play_sessions (kind, started_at desc);
create unique index if not exists play_sessions_score_idx on public.play_sessions (score_id) where score_id is not null;
create unique index if not exists play_sessions_round_idx on public.play_sessions (round_id) where round_id is not null;

alter table public.play_sessions enable row level security;
drop policy if exists "players insert own sessions" on public.play_sessions;
create policy "players insert own sessions" on public.play_sessions
  for insert with check ((select auth.uid()) = user_id);
drop policy if exists "players update own sessions" on public.play_sessions;
create policy "players update own sessions" on public.play_sessions
  for update using ((select auth.uid()) = user_id);
drop policy if exists "own or admin can view sessions" on public.play_sessions;
create policy "own or admin can view sessions" on public.play_sessions
  for select using (
    user_id = (select auth.uid())
    or exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.account_type = 'admin')
  );
revoke all on table public.play_sessions from anon, authenticated;
grant select, insert, update on table public.play_sessions to authenticated;

-- A player may close a session but never rewrite who it belongs to or when
-- it started, and never reopen one.
create or replace function public.guard_play_session()
returns trigger language plpgsql set search_path = public as $$
begin
  if coalesce(auth.role(), '') not in ('authenticated', 'anon') then return NEW; end if;
  if TG_OP = 'INSERT' then
    NEW.started_at := now(); NEW.ended_at := null; NEW.outcome := null;
    NEW.holes_completed := null; NEW.score_id := null; NEW.round_id := null;
    return NEW;
  end if;
  if NEW.user_id is distinct from OLD.user_id or NEW.kind is distinct from OLD.kind
     or NEW.started_at is distinct from OLD.started_at then
    raise exception 'Session identity cannot be changed' using errcode = '42501';
  end if;
  if OLD.outcome is not null and NEW.outcome is distinct from OLD.outcome then
    raise exception 'Session already closed' using errcode = '42501';
  end if;
  if NEW.outcome is not null and OLD.outcome is null then NEW.ended_at := now(); end if;
  return NEW;
end;
$$;
drop trigger if exists guard_play_session on public.play_sessions;
create trigger guard_play_session
  before insert or update on public.play_sessions
  for each row execute function public.guard_play_session();

-- ─── Backfill: everything already played counts ─────────────────────────────
insert into public.play_sessions (user_id, kind, difficulty, started_at, ended_at, outcome, holes_planned, holes_completed, seed, challenge_id, score_id, meta)
select s.user_id, 'arcade', s.difficulty,
       s.created_at - make_interval(secs => coalesce(s.total_seconds, 0)), s.created_at, 'completed',
       s.holes, s.holes, s.seed, s.challenge_id, s.id, jsonb_build_object('backfilled', true)
from public.arcade_scores s
on conflict (score_id) where score_id is not null do nothing;

insert into public.play_sessions (user_id, kind, difficulty, started_at, ended_at, outcome, holes_planned, holes_completed, course_name, players, round_id, meta)
select r.user_id, 'clocked', r.difficulty,
       coalesce(r.tee_time::timestamptz, r.created_at - make_interval(mins => coalesce(r.duration_minutes, 0))), r.created_at, 'completed',
       r.holes, coalesce(jsonb_array_length(r.hole_scores), r.holes), r.course_name, r.players, r.id, jsonb_build_object('backfilled', true)
from public.rounds r
where r.round_format = 'clocked' and r.user_id is not null
on conflict (round_id) where round_id is not null do nothing;

-- ─── Admin stats ────────────────────────────────────────────────────────────
create or replace function public.admin_play_stats()
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  v jsonb;
begin
  if coalesce(auth.role(), '') in ('authenticated', 'anon')
     and not exists (select 1 from public.profiles p where p.id = auth.uid() and p.account_type = 'admin') then
    raise exception 'admins only' using errcode = '42501';
  end if;

  with k as (select unnest(array['arcade', 'clocked']) as kind),
  tot as (
    select k.kind,
      count(s.id)                                                             as starts,
      count(s.id) filter (where s.outcome = 'completed')                      as completed,
      count(distinct s.user_id)                                               as players,
      count(s.id) filter (where s.started_at > now() - interval '7 days')     as starts_7d,
      count(s.id) filter (where s.started_at > now() - interval '30 days')    as starts_30d,
      count(s.id) filter (where s.outcome = 'completed' and s.started_at > now() - interval '7 days')  as completed_7d,
      count(s.id) filter (where s.outcome = 'completed' and s.started_at > now() - interval '30 days') as completed_30d,
      count(distinct s.user_id) filter (where s.started_at > now() - interval '7 days')  as players_7d,
      count(distinct s.user_id) filter (where s.started_at > now() - interval '30 days') as players_30d,
      round(avg(s.holes_completed) filter (where s.outcome = 'completed'), 1)  as avg_holes
    from k left join public.play_sessions s on s.kind = k.kind
    group by k.kind
  ),
  per_user as (
    select s.user_id, p.full_name, p.username, p.created_at as joined,
      count(*) filter (where s.kind = 'arcade')                                as arcade_starts,
      count(*) filter (where s.kind = 'arcade' and s.outcome = 'completed')    as arcade_completed,
      count(*) filter (where s.kind = 'clocked')                               as clocked_starts,
      count(*) filter (where s.kind = 'clocked' and s.outcome = 'completed')   as clocked_completed,
      max(s.started_at)                                                        as last_active
    from public.play_sessions s join public.profiles p on p.id = s.user_id
    group by s.user_id, p.full_name, p.username, p.created_at
    order by count(*) desc, max(s.started_at) desc
    limit 200
  )
  select jsonb_build_object(
    'generated_at', now(),
    'profiles', (select count(*) from public.profiles),
    'totals', (select jsonb_object_agg(kind, to_jsonb(tot) - 'kind') from tot),
    'users', (select coalesce(jsonb_agg(to_jsonb(per_user)), '[]'::jsonb) from per_user)
  ) into v;
  return v;
end;
$$;
revoke all on function public.admin_play_stats() from public;
grant execute on function public.admin_play_stats() to authenticated, service_role;
