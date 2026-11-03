-- ─── Arcade seasons, qualifiers, and friend challenges — 2026-11-03 ─────────
-- Turns the arcade into a path to real events and into a head-to-head game.
--
--   arcade_season_board(season)  best qualifying run per player this month
--                                (intermediate + pro only; beginner's big cup
--                                does not count toward qualifying)
--   arcade_qualifiers            the top 10 at month end, frozen by
--                                close_arcade_season(); admins invite them to
--                                the first event's qualifier
--   arcade_challenges            same seed, same difficulty, two players,
--                                7 days to post a run; winner by points, then time

-- ═══ 1. arcade_scores: link a run to a challenge; runs are immutable ═════════
alter table public.arcade_scores add column if not exists challenge_id uuid;
create index if not exists arcade_scores_user_created_idx on public.arcade_scores (user_id, created_at desc);
create index if not exists arcade_scores_created_idx on public.arcade_scores (created_at desc);
revoke update, delete on table public.arcade_scores from anon, authenticated;

-- ═══ 2. Season board ════════════════════════════════════════════════════════
create or replace function public.arcade_season_board(p_season text default to_char(now(), 'YYYY-MM'))
returns table (rank int, user_id uuid, score_id uuid, points int, total_seconds int, difficulty text, created_at timestamptz)
language sql stable
set search_path = public
as $$
  with runs as (
    select s.id as score_id, s.user_id, s.points, s.total_seconds, s.difficulty, s.created_at,
           row_number() over (partition by s.user_id order by s.points desc, s.total_seconds asc, s.created_at asc) as rn
    from public.arcade_scores s
    where to_char(s.created_at at time zone 'America/New_York', 'YYYY-MM') = p_season
      and s.difficulty in ('intermediate', 'pro')
      and s.holes = 9
  )
  select (row_number() over (order by points desc, total_seconds asc, created_at asc))::int as rank,
         user_id, score_id, points, total_seconds, difficulty, created_at
  from runs where rn = 1
  order by points desc, total_seconds asc, created_at asc
  limit 100;
$$;
grant execute on function public.arcade_season_board(text) to anon, authenticated;

-- ═══ 3. Qualifiers ══════════════════════════════════════════════════════════
create table if not exists public.arcade_qualifiers (
  id            uuid primary key default gen_random_uuid(),
  season        text not null,
  user_id       uuid not null references public.profiles(id) on delete cascade,
  rank          int  not null,
  points        int  not null,
  total_seconds int  not null,
  score_id      uuid,
  status        text not null default 'earned' check (status in ('earned', 'invited', 'declined', 'claimed')),
  created_at    timestamptz not null default now(),
  reviewed_at   timestamptz,
  reviewer_note text,
  unique (season, user_id)
);
alter table public.arcade_qualifiers enable row level security;
drop policy if exists "own or admin can view qualifiers" on public.arcade_qualifiers;
create policy "own or admin can view qualifiers" on public.arcade_qualifiers
  for select using (
    user_id = (select auth.uid())
    or exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.account_type = 'admin')
  );
drop policy if exists "admins can update qualifiers" on public.arcade_qualifiers;
create policy "admins can update qualifiers" on public.arcade_qualifiers
  for update using (exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.account_type = 'admin'));
revoke all on table public.arcade_qualifiers from anon, authenticated;
grant select, update on table public.arcade_qualifiers to authenticated;

-- Freeze a season: top 10 of the board → qualifiers, each gets an inbox row.
-- Admin-only (or service role). Safe to re-run: existing rows are kept.
create or replace function public.close_arcade_season(p_season text)
returns int
language plpgsql security definer
set search_path = public
as $$
declare
  v_inserted int := 0;
  r record;
begin
  if coalesce(auth.role(), '') in ('authenticated', 'anon')
     and not exists (select 1 from public.profiles p where p.id = auth.uid() and p.account_type = 'admin') then
    raise exception 'admins only' using errcode = '42501';
  end if;
  for r in select * from public.arcade_season_board(p_season) where rank <= 10 loop
    insert into public.arcade_qualifiers (season, user_id, rank, points, total_seconds, score_id)
    values (p_season, r.user_id, r.rank, r.points, r.total_seconds, r.score_id)
    on conflict (season, user_id) do nothing;
    if found then
      v_inserted := v_inserted + 1;
      insert into public.notifications (user_id, type, title, body, meta)
      values (r.user_id, 'arcade_qualifier', 'You qualified',
              format('You finished #%s on the %s Arcade board. That earns a spot in the first Clocked event''s qualifier. We''ll reach out with details.', r.rank, to_char(to_date(p_season, 'YYYY-MM'), 'FMMonth YYYY')),
              jsonb_build_object('season', p_season, 'rank', r.rank));
    end if;
  end loop;
  return v_inserted;
end;
$$;
revoke all on function public.close_arcade_season(text) from public;
grant execute on function public.close_arcade_season(text) to authenticated, service_role;

-- ═══ 4. Friend challenges ═══════════════════════════════════════════════════
create table if not exists public.arcade_challenges (
  id                   uuid primary key default gen_random_uuid(),
  challenger_id        uuid not null references public.profiles(id) on delete cascade,
  challenged_id        uuid not null references public.profiles(id) on delete cascade,
  seed                 text not null,
  difficulty           text not null check (difficulty in ('beginner', 'intermediate', 'pro')),
  status               text not null default 'pending' check (status in ('pending', 'accepted', 'declined', 'complete', 'expired')),
  challenger_score_id  uuid,
  challenged_score_id  uuid,
  challenger_points    int,
  challenged_points    int,
  challenger_seconds   int,
  challenged_seconds   int,
  winner_id            uuid,
  expires_at           timestamptz not null default now() + interval '7 days',
  created_at           timestamptz not null default now(),
  completed_at         timestamptz,
  check (challenger_id <> challenged_id)
);
create index if not exists arcade_challenges_challenged_idx on public.arcade_challenges (challenged_id, status, created_at desc);
create index if not exists arcade_challenges_challenger_idx on public.arcade_challenges (challenger_id, status, created_at desc);
alter table public.arcade_challenges enable row level security;
drop policy if exists "participants can view arcade challenges" on public.arcade_challenges;
create policy "participants can view arcade challenges" on public.arcade_challenges
  for select using ((select auth.uid()) in (challenger_id, challenged_id));
drop policy if exists "challenger can create arcade challenge" on public.arcade_challenges;
create policy "challenger can create arcade challenge" on public.arcade_challenges
  for insert with check ((select auth.uid()) = challenger_id);
drop policy if exists "participants can update arcade challenges" on public.arcade_challenges;
create policy "participants can update arcade challenges" on public.arcade_challenges
  for update using ((select auth.uid()) in (challenger_id, challenged_id));
revoke all on table public.arcade_challenges from anon, authenticated;
grant select, insert, update on table public.arcade_challenges to authenticated;

-- A participant may only: answer (challenged: pending → accepted/declined),
-- post their own score once, and nothing else. Winner and completion are
-- computed here, never trusted from the client.
create or replace function public.guard_arcade_challenge()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  me uuid := auth.uid();
begin
  if coalesce(auth.role(), '') not in ('authenticated', 'anon') then return NEW; end if;

  if TG_OP = 'INSERT' then
    NEW.status := 'pending';
    NEW.challenger_score_id := null; NEW.challenged_score_id := null;
    NEW.challenger_points := null;   NEW.challenged_points := null;
    NEW.challenger_seconds := null;  NEW.challenged_seconds := null;
    NEW.winner_id := null; NEW.completed_at := null;
    NEW.expires_at := now() + interval '7 days';
    return NEW;
  end if;

  -- Immutable fields.
  if NEW.challenger_id is distinct from OLD.challenger_id or NEW.challenged_id is distinct from OLD.challenged_id
     or NEW.seed is distinct from OLD.seed or NEW.difficulty is distinct from OLD.difficulty
     or NEW.expires_at is distinct from OLD.expires_at or NEW.created_at is distinct from OLD.created_at then
    raise exception 'Challenge terms cannot be changed' using errcode = '42501';
  end if;
  -- Only the challenged player answers, and only while pending.
  if NEW.status is distinct from OLD.status then
    if not (OLD.status = 'pending' and me = OLD.challenged_id and NEW.status in ('accepted', 'declined')) then
      raise exception 'Only the challenged player can answer a pending challenge' using errcode = '42501';
    end if;
  end if;
  -- Scores: your own side only, once, and the run must be yours and on this challenge.
  if NEW.challenger_score_id is distinct from OLD.challenger_score_id then
    if me <> OLD.challenger_id or OLD.challenger_score_id is not null then raise exception 'Not your score to set' using errcode = '42501'; end if;
    if not exists (select 1 from public.arcade_scores s where s.id = NEW.challenger_score_id and s.user_id = me and s.challenge_id = OLD.id) then
      raise exception 'Score does not belong to this challenge' using errcode = '42501';
    end if;
    select s.points, s.total_seconds into NEW.challenger_points, NEW.challenger_seconds from public.arcade_scores s where s.id = NEW.challenger_score_id;
  end if;
  if NEW.challenged_score_id is distinct from OLD.challenged_score_id then
    if me <> OLD.challenged_id or OLD.challenged_score_id is not null then raise exception 'Not your score to set' using errcode = '42501'; end if;
    if OLD.status <> 'accepted' then raise exception 'Accept the challenge first' using errcode = '42501'; end if;
    if not exists (select 1 from public.arcade_scores s where s.id = NEW.challenged_score_id and s.user_id = me and s.challenge_id = OLD.id) then
      raise exception 'Score does not belong to this challenge' using errcode = '42501';
    end if;
    select s.points, s.total_seconds into NEW.challenged_points, NEW.challenged_seconds from public.arcade_scores s where s.id = NEW.challenged_score_id;
  end if;
  -- Clients never set these directly.
  if NEW.challenger_points is distinct from OLD.challenger_points and NEW.challenger_score_id is not distinct from OLD.challenger_score_id then NEW.challenger_points := OLD.challenger_points; end if;
  if NEW.challenged_points is distinct from OLD.challenged_points and NEW.challenged_score_id is not distinct from OLD.challenged_score_id then NEW.challenged_points := OLD.challenged_points; end if;
  NEW.winner_id := OLD.winner_id; NEW.completed_at := OLD.completed_at;

  -- Both in: settle.
  if NEW.challenger_score_id is not null and NEW.challenged_score_id is not null and OLD.completed_at is null then
    NEW.status := 'complete';
    NEW.completed_at := now();
    NEW.winner_id := case
      when NEW.challenger_points > NEW.challenged_points then NEW.challenger_id
      when NEW.challenged_points > NEW.challenger_points then NEW.challenged_id
      when NEW.challenger_seconds < NEW.challenged_seconds then NEW.challenger_id
      when NEW.challenged_seconds < NEW.challenger_seconds then NEW.challenged_id
      else null end;
  end if;
  return NEW;
end;
$$;
drop trigger if exists guard_arcade_challenge on public.arcade_challenges;
create trigger guard_arcade_challenge
  before insert or update on public.arcade_challenges
  for each row execute function public.guard_arcade_challenge();
