-- ─── Security hardening — 2026-10-27 ─────────────────────────────────────────
-- Findings this migration closes (see docs/SECURITY_AUDIT_2026-10.md):
--   SEC-01  profiles exposed email / push_token / consent + trial internals to
--           anyone holding the public anon key.
--   SEC-02  any user could set profiles.account_type = 'admin' (INSERT at
--           signup or UPDATE on their own row), unlocking the admin RLS
--           policies on the review-queue tables and courses.
--   SEC-03  users could self-grant Pro (pro_expires_at / is_pro-adjacent
--           fields), referral credit, and clear moderation counters.
--   SEC-07  rounds: clients could insert rows marked verified / un-flagged
--           and implausible values; round_participants: a participant could
--           rewrite their own hole_scores / total_points.
--   SEC-08  courses carried a blanket "any authenticated user may UPDATE"
--           policy; anon/authenticated held TRUNCATE/TRIGGER/REFERENCES and
--           write privileges on read-only tables.
--
-- Also adds profiles.bio, which EditProfileScreen has been writing to a
-- column that did not exist (every profile save failed with PGRST204).
--
-- Everything here is additive or restrictive-by-grant. Nothing deletes data.
-- Roll back by running the "ROLLBACK" block at the bottom of this file.

-- ═══ 1. profiles: add the missing bio column ════════════════════════════════
alter table public.profiles add column if not exists bio text;

-- ═══ 2. profiles: column-level SELECT for client roles (SEC-01) ═════════════
-- The row policy stays `select using (true)` (leaderboards, public profiles,
-- username availability all read other users' rows) but client roles may now
-- only read the columns below. Sensitive columns are readable by the service
-- role only. NOTE: `select *` on profiles fails for clients after this; the
-- app selects explicit columns (lib/profileColumns.js).
revoke select on table public.profiles from anon, authenticated;
grant select (
  id, full_name, first_name, last_name, username, avatar_url,
  hometown, home_course, home_state, home_country, bio,
  handicap, handicap_index, handicap_trend, avg_score, typical_round_time,
  pop_score, national_rank, account_type, preferred_difficulty,
  referral_code, referral_count, is_pro, pro_expires_at, created_at,
  caddy_rating, caddy_course, caddy_courses, caddy_experience,
  caddy_experience_years, caddy_total_loops, caddy_avg_round_time,
  caddy_fastest_round, caddy_home_club_rank, caddy_state_rank,
  caddy_national_rank
) on table public.profiles to anon, authenticated;
-- Not granted (service role only): email, push_token, tos_agreed_at,
-- flagged_count, gps_interest, referred_by, referral_reward_granted,
-- trial_started_at, subscription_source, pro_trial_active, age_verified,
-- petition_opt_in, petition_opt_in_at.

-- ═══ 3. profiles: protect privileged columns from client writes (SEC-02/03) ═
-- Replaces the existing BEFORE UPDATE trigger (which only guarded is_pro,
-- national_rank, caddy_rating) and now also fires on INSERT.
-- Server-side code that legitimately touches these columns runs as the
-- service role (auth.role() is null → passes through). SECURITY DEFINER SQL
-- functions still carry the caller's JWT role, so they opt out with the
-- transaction-local setting app.bypass_profile_guard = 'on'.
create or replace function public.protect_sensitive_profile_fields()
returns trigger
language plpgsql
set search_path to 'public'
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
  or NEW.caddy_national_rank     is distinct from OLD.caddy_national_rank then
    raise exception 'Protected profile field cannot be modified directly'
      using errcode = '42501';
  end if;
  return NEW;
end;
$$;

drop trigger if exists protect_profile_fields on public.profiles;
create trigger protect_profile_fields
  before insert or update on public.profiles
  for each row execute function public.protect_sensitive_profile_fields();

-- apply_referral writes referred_by / referral_count on the caller's behalf;
-- it opts out of the guard for the duration of its transaction.
create or replace function public.apply_referral(referrer_uuid uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  perform set_config('app.bypass_profile_guard', 'on', true);

  -- Only set referred_by if not already set and not self-referral
  update profiles
  set referred_by = referrer_uuid::text
  where id = auth.uid()
    and referred_by is null
    and id != referrer_uuid;

  -- Only increment if the update above actually changed a row
  if found then
    update profiles
    set referral_count = referral_count + 1
    where id = referrer_uuid;
  end if;
end;
$$;

-- update_profile_safe referenced columns that do not exist (country,
-- profile_picture_url) and has no caller in the app or website. Removed.
-- Original body is preserved in docs/SECURITY_AUDIT_2026-10.md.
drop function if exists public.update_profile_safe(uuid, text, text, text, numeric, text, text, text);

-- ═══ 4. rounds: client writes can't self-verify; sane bounds (SEC-07) ═══════
create or replace function public.guard_round_client_writes()
returns trigger
language plpgsql
set search_path to 'public'
as $$
begin
  if coalesce(auth.role(), '') not in ('authenticated', 'anon') then
    return NEW;
  end if;

  if TG_OP = 'INSERT' then
    NEW.verification_level := 'self_reported';   -- clients cannot claim "verified"
    NEW.flagged_count      := 0;
  else
    if NEW.user_id            is distinct from OLD.user_id
    or NEW.verification_level is distinct from OLD.verification_level
    or NEW.flagged_count      is distinct from OLD.flagged_count
    or (OLD.flagged = true and NEW.flagged = false) then   -- cannot un-flag yourself
      raise exception 'Protected round field cannot be modified directly'
        using errcode = '42501';
    end if;
  end if;

  if NEW.holes is not null and NEW.holes not in (9, 18) then
    raise exception 'holes must be 9 or 18';
  end if;
  if NEW.players is not null and (NEW.players < 1 or NEW.players > 8) then
    raise exception 'players must be between 1 and 8';
  end if;
  if NEW.duration_minutes is not null and (NEW.duration_minutes < 1 or NEW.duration_minutes > 1440) then
    raise exception 'duration_minutes out of range';
  end if;
  return NEW;
end;
$$;

drop trigger if exists guard_round_client_writes on public.rounds;
create trigger guard_round_client_writes
  before insert or update on public.rounds
  for each row execute function public.guard_round_client_writes();

-- ═══ 5. round_participants: a participant may only confirm/decline ════════
create or replace function public.guard_participant_client_updates()
returns trigger
language plpgsql
set search_path to 'public'
as $$
begin
  if coalesce(auth.role(), '') not in ('authenticated', 'anon') then
    return NEW;
  end if;
  if NEW.round_id     is distinct from OLD.round_id
  or NEW.user_id      is distinct from OLD.user_id
  or NEW.player_key   is distinct from OLD.player_key
  or NEW.hole_scores  is distinct from OLD.hole_scores
  or NEW.total_points is distinct from OLD.total_points
  or NEW.total_score  is distinct from OLD.total_score then
    raise exception 'Only status and confirmed_at may be changed on a participant row'
      using errcode = '42501';
  end if;
  if NEW.status not in ('pending', 'confirmed', 'declined') then
    raise exception 'Invalid participant status';
  end if;
  return NEW;
end;
$$;

drop trigger if exists guard_participant_client_updates on public.round_participants;
create trigger guard_participant_client_updates
  before update on public.round_participants
  for each row execute function public.guard_participant_client_updates();

-- ═══ 6. courses: only admins may update (SEC-08) ════════════════════════════
-- The blanket policy was inert (no UPDATE grant) but a future GRANT would
-- have armed it. The admin policy stays and now actually works because the
-- grant below is scoped to it.
drop policy if exists "Allow authenticated updates" on public.courses;
grant update on table public.courses to authenticated;

-- ═══ 7. Least-privilege grants ══════════════════════════════════════════════
-- Supabase's default GRANT ALL gives client roles privileges PostgREST never
-- uses (TRUNCATE is not even subject to RLS). Remove them everywhere, remove
-- all write privileges from the unauthenticated role, and remove write
-- privileges from authenticated on tables that have no write policy.
revoke truncate, trigger, references on all tables in schema public from anon, authenticated;
revoke insert, update, delete on all tables in schema public from anon;
revoke insert, update, delete on table
  public.app_config, public.course_time_pars, public.tournaments,
  public.tournament_results
from authenticated;
revoke insert, delete on table public.courses from authenticated;

-- Default privileges for tables created later: no TRUNCATE/TRIGGER/REFERENCES
-- for client roles. (Supabase's own defaults are set for the postgres role.)
alter default privileges for role postgres in schema public
  revoke truncate, trigger, references on tables from anon, authenticated;

-- ═══ ROLLBACK (run manually if needed) ══════════════════════════════════════
-- grant select on table public.profiles to anon, authenticated;
-- drop trigger if exists guard_round_client_writes on public.rounds;
-- drop trigger if exists guard_participant_client_updates on public.round_participants;
-- -- restore the previous (UPDATE-only, 3-column) protect trigger:
-- --   see docs/SECURITY_AUDIT_2026-10.md "Original database objects".
-- create policy "Allow authenticated updates" on public.courses for update
--   using ((select auth.role()) = 'authenticated');
-- revoke update on table public.courses from authenticated;
-- grant insert, update, delete, truncate, trigger, references on all tables in schema public to anon, authenticated;
