-- ─── Audit hardening — 2026-11-09 ───────────────────────────────────────────
-- Answers CG-002, CG-003, CG-004, CG-008, CG-023 and CG-032 of the app audit.
--
--   profiles.is_test            test and review accounts, kept off every board
--   arcade_scores               value limits, one score per started run, a
--                               server-set `verified` flag, build + ruleset +
--                               pause telemetry
--   arcade_season_board()       verified runs from real accounts only
--   rounds                      one saved round per (player, start time)
--   advisors                    grants, duplicate index, policy, FK indexes
--
-- Safe to run twice. Nothing is deleted.

-- ── 1. Test accounts ────────────────────────────────────────────────────────
alter table public.profiles add column if not exists is_test boolean not null default false;

update public.profiles set is_test = true
 where username in ('development', 'alexreviewer') and is_test = false;

-- The same guard as before, with is_test added: a client can never clear or
-- set the flag on its own row.
create or replace function public.protect_sensitive_profile_fields()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if coalesce(auth.role(), '') not in ('authenticated', 'anon')
     or current_setting('app.bypass_profile_guard', true) = 'on' then
    return NEW;  -- service / backend contexts pass through
  end if;

  if TG_OP = 'INSERT' then
    -- A brand-new profile created from the client always starts as a plain
    -- golfer with no entitlements, no referral credit and clean counters.
    NEW.account_type            := 'golfer';
    NEW.is_pro                  := false;
    NEW.pro_trial_active        := false;
    NEW.pro_expires_at          := null;
    NEW.trial_started_at        := null;
    NEW.subscription_source     := 'none';
    NEW.referral_count          := 0;
    NEW.referral_reward_granted := false;
    NEW.referred_by             := null;
    NEW.flagged_count           := 0;
    NEW.national_rank           := null;
    NEW.pop_score               := 2.5;
    NEW.caddy_rating            := 2.5;
    NEW.is_test                 := false;
    return NEW;
  end if;

  -- UPDATE: a client may not change any of these on its own row.
  if NEW.id                      is distinct from OLD.id
  or (NEW.email is distinct from OLD.email and OLD.email is not null)  -- first set allowed
  or NEW.account_type            is distinct from OLD.account_type
  or NEW.is_pro                  is distinct from OLD.is_pro
  or NEW.pro_trial_active        is distinct from OLD.pro_trial_active
  or NEW.pro_expires_at          is distinct from OLD.pro_expires_at
  or NEW.trial_started_at        is distinct from OLD.trial_started_at
  or NEW.subscription_source     is distinct from OLD.subscription_source
  or NEW.referral_count          is distinct from OLD.referral_count
  or NEW.referral_reward_granted is distinct from OLD.referral_reward_granted
  or NEW.referred_by             is distinct from OLD.referred_by
  or NEW.flagged_count           is distinct from OLD.flagged_count
  or NEW.national_rank           is distinct from OLD.national_rank
  or NEW.pop_score               is distinct from OLD.pop_score
  or NEW.handicap_index          is distinct from OLD.handicap_index
  or NEW.caddy_rating            is distinct from OLD.caddy_rating
  or NEW.caddy_home_club_rank    is distinct from OLD.caddy_home_club_rank
  or NEW.caddy_state_rank        is distinct from OLD.caddy_state_rank
  or NEW.caddy_national_rank     is distinct from OLD.caddy_national_rank
  or NEW.is_test                 is distinct from OLD.is_test then
    raise exception 'Protected profile field cannot be modified directly'
      using errcode = '42501';
  end if;
  return NEW;
end;
$$;

-- ── 2. Arcade scores: columns ───────────────────────────────────────────────
alter table public.arcade_scores
  add column if not exists session_id      uuid references public.play_sessions(id) on delete set null,
  add column if not exists verified        boolean not null default false,
  add column if not exists app_version     text,
  add column if not exists ruleset_version int,
  add column if not exists pause_count     int,
  add column if not exists paused_seconds  int;

-- Every run posted before the guard existed was played in the app by a known
-- account: carry them over as verified and link the sessions that exist.
update public.arcade_scores a set session_id = p.id
  from public.play_sessions p
 where p.score_id = a.id and a.session_id is null;

do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'guard_arcade_score' and tgrelid = 'public.arcade_scores'::regclass) then
    update public.arcade_scores set verified = true where verified = false;
  end if;
end $$;

create unique index if not exists arcade_scores_session_idx
  on public.arcade_scores (session_id) where session_id is not null;

-- ── 3. Arcade scores: value limits ──────────────────────────────────────────
-- A nine: 9 to 72 strokes, 2 to 60 minutes, -27 to 90 points.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'arcade_scores_sane_values' and conrelid = 'public.arcade_scores'::regclass) then
    alter table public.arcade_scores add constraint arcade_scores_sane_values check (
          holes = 9
      and total_strokes between 9 and 72
      and total_seconds between 120 and 3600
      and points between -27 and 90
      and (clocked_score is null or clocked_score between 0 and 100)
      and holes_under_clock between 0 and 9
      and seed is not null and length(seed) <= 64
      and (pause_count is null or pause_count between 0 and 10000)
      and (paused_seconds is null or paused_seconds between 0 and 864000)
    );
  end if;
end $$;

-- ── 4. Arcade scores: one score per started run ─────────────────────────────
-- The app opens a play session when a run starts (the server stamps the
-- start time) and posts the score when it ends. A score is `verified` when it
-- matches a session of the same player, seed and level that has no score yet
-- and that started long enough ago to have been played. A second score for a
-- session is refused. A score with no session at all is stored unverified:
-- it is kept for review and never ranks.
create or replace function public.guard_arcade_score()
returns trigger
language plpgsql security definer
set search_path = public
as $$
declare
  v_id      uuid;
  v_started timestamptz;
  v_wall    numeric;
begin
  if coalesce(auth.role(), '') not in ('authenticated', 'anon') then
    return NEW;  -- service / backend contexts pass through
  end if;

  NEW.created_at := now();
  NEW.session_id := null;
  NEW.verified   := false;

  select p.id, p.started_at into v_id, v_started
    from public.play_sessions p
   where p.user_id = NEW.user_id
     and p.kind = 'arcade'
     and p.seed is not distinct from NEW.seed
     and p.difficulty is not distinct from NEW.difficulty
     and coalesce(p.outcome, 'completed') <> 'abandoned'
     and p.started_at > now() - interval '12 hours'
     and not exists (select 1 from public.arcade_scores a where a.session_id = p.id)
   order by p.started_at desc
   limit 1
   for update of p;

  if v_id is not null then
    v_wall := extract(epoch from (now() - v_started));
    NEW.session_id := v_id;
    -- The game clock cannot run faster than the wall clock, and no nine is
    -- played in under three minutes.
    NEW.verified := v_wall >= greatest(180, NEW.total_seconds * 0.9);
    return NEW;
  end if;

  if exists (
    select 1 from public.play_sessions p
      join public.arcade_scores a on a.session_id = p.id
     where p.user_id = NEW.user_id and p.kind = 'arcade'
       and p.seed is not distinct from NEW.seed
       and p.difficulty is not distinct from NEW.difficulty
       and p.started_at > now() - interval '12 hours'
  ) then
    raise exception 'This run has already been posted' using errcode = '23505';
  end if;

  return NEW;  -- no session: stored, unverified
end;
$$;

drop trigger if exists guard_arcade_score on public.arcade_scores;
create trigger guard_arcade_score
  before insert on public.arcade_scores
  for each row execute function public.guard_arcade_score();

-- Link the session to its score from the server side, so the link does not
-- depend on a second request from the phone.
create or replace function public.link_arcade_score_session()
returns trigger
language plpgsql security definer
set search_path = public
as $$
begin
  if NEW.session_id is not null then
    update public.play_sessions
       set score_id = NEW.id
     where id = NEW.session_id and score_id is null;
  end if;
  return null;
end;
$$;

drop trigger if exists link_arcade_score_session on public.arcade_scores;
create trigger link_arcade_score_session
  after insert on public.arcade_scores
  for each row execute function public.link_arcade_score_session();

revoke execute on function public.guard_arcade_score() from public, anon, authenticated;
revoke execute on function public.link_arcade_score_session() from public, anon, authenticated;

-- ── 5. The monthly board: verified runs from real accounts ──────────────────
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
      and s.verified
      and not exists (select 1 from public.profiles p where p.id = s.user_id and p.is_test)
  )
  select (row_number() over (order by points desc, total_seconds asc, created_at asc))::int as rank,
         user_id, score_id, points, total_seconds, difficulty, created_at
  from runs where rn = 1
  order by points desc, total_seconds asc, created_at asc
  limit 100;
$$;

-- ── 6. Runs that were started and never closed ──────────────────────────────
update public.play_sessions
   set outcome = 'abandoned', ended_at = coalesce(ended_at, started_at)
 where kind = 'arcade' and outcome is null
   and started_at < now() - interval '6 hours';

-- ── 7. Clocked rounds: one row per (player, start time) ─────────────────────
-- A double tap on FINISH used to save the same round twice. The app now
-- guards it; this makes the database refuse it too. Rows saved before today
-- are left exactly as they are (the index only covers rows from now on).
do $$
begin
  if not exists (select 1 from pg_indexes where schemaname = 'public' and indexname = 'rounds_clocked_once_idx') then
    execute format(
      'create unique index rounds_clocked_once_idx on public.rounds (user_id, tee_time)
         where round_format = ''clocked'' and tee_time is not null and created_at >= %L::timestamptz',
      to_char(now() at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"+00"'));
  end if;
end $$;

-- ── 8. Advisor findings ─────────────────────────────────────────────────────
-- Admin RPCs keep their own admin check; a signed-out caller has no business
-- reaching them at all.
revoke execute on function public.admin_play_stats() from public, anon;
revoke execute on function public.close_arcade_season(text) from public, anon;
grant  execute on function public.admin_play_stats() to authenticated, service_role;
grant  execute on function public.close_arcade_season(text) to authenticated, service_role;

drop index if exists public.arcade_scores_user_created_idx;   -- twin of arcade_scores_user_idx

drop policy if exists "insert own arcade score" on public.arcade_scores;
create policy "insert own arcade score" on public.arcade_scores
  for insert with check ((select auth.uid()) = user_id);

create index if not exists arcade_qualifiers_user_idx            on public.arcade_qualifiers (user_id);
create index if not exists tournament_results_tournament_idx     on public.tournament_results (tournament_id);
create index if not exists tournament_results_user_idx           on public.tournament_results (user_id);
create index if not exists course_cert_inquiries_course_idx      on public.course_certification_inquiries (existing_course_id);
