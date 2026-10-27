# Clocked Golf — Codebase Cleanup & Security Audit (October 2026)

Branch: `audit/cleanup-hardening` (from `main` @ d6397b9).
Scope: React Native / Expo app (`App.js`, `screens/`, `lib/`, `components/`, `hooks/`, `context/`), Supabase edge functions, the live Supabase project's schema / RLS / grants, dependencies.

Method: static review of every client-side database call (verified against the live `pg_policies`, `pg_proc`, `role_table_grants` via `supabase db query --linked`), anonymous REST probes with the public anon key (reads only; row counts and column names recorded, never values), `npm audit`, and a transactional dry-run of the remediation migration with simulated client roles.

## 1. Overall assessment

Before this work the app's security boundary was almost entirely the RLS *row* policies, and several of them were wide enough that any holder of the public anon key (which ships inside the app binary) could read every user's email address and Expo push token, and any signed-in user could promote themselves to admin, grant themselves Pro, or send email from `hello@clocked.golf` to anyone. Those are fixed in code (edge functions, client) and in a prepared migration (database). After the migration is applied, remaining risk is moderate and mostly structural: scores are still self-reported by design, the auth session is stored unencrypted on device, and the public edge endpoints have no rate limiting beyond what is built into send-push.

**Status: the database migration was applied and all five edge functions were deployed on 2026-10-27**, after the dry-run below and with explicit authorization. Live verification results are in §5.

## 2. Code removed or simplified

| Removed | Lines | Why safe |
|---|---|---|
| `screens/LiveRoundScreen.js` | 2,218 | Not routed; App.js comment marks it retired 2026-07-14. Import walk from `index.js` never reaches it. |
| `screens/HomeScreen.js` | 894 | Imported by App.js but never registered as a route. Calls an RPC (`get_or_set_course_of_the_day`) that does not exist in the database. |
| `screens/CoursesScreen.js` | 480 | Imported, never routed. |
| `lib/gameEngines.js`, `lib/mockGreens.js`, `lib/geo.js`, `lib/handicap.js`, `components/RangefinderCard.js`, `hooks/useCurrentLocation.js` | ~870 | Only consumers were the three screens above. |
| `lib/popScore.js` (trimmed to `isPar3Course`) | −220 | Every other export (pace scoring, client-side fraud heuristics, `profiles.pop_score` / `national_rank` writers) was used only by LiveRoundScreen. The profile writers would now be blocked by the new trigger anyway. |
| `scheduleWeeklyDigest` in `lib/notifications.js` | −45 | Only caller was HomeScreen. |
| `buildWelcomeEmail` in `SignUpScreen.js` | −25 | Template moved server-side (see SEC-05). |
| Packages `expo-location`, `expo-blur` | — | Zero imports after the above. Location permission strings and the `expo-location` plugin removed from `app.json` (the app no longer asks for location). Requires a native rebuild. |
| `supabase/.temp/*`, `.env` | — | Untracked from git (both were already in `.gitignore`; files are kept locally). `.env` is not read by the app at all — `lib/supabase.js` embeds the public URL and anon key directly. |
| DB function `update_profile_safe` | — | Referenced columns that do not exist (`country`, `profile_picture_url`), no caller. Dropped by the migration; original body below. |

Net: about 4,700 lines removed. 73 → 64 source files.

## 3. Security findings

Severity uses Critical / High / Medium / Low / Info. "Verified" means reproduced against the live project (read-only) or by executing the guard inside a rolled-back transaction.

### SEC-01 — Critical — Any anon-key holder can read every user's email and push token
- **Where:** `public.profiles` policy `select_profiles` = `using (true)` combined with the default `GRANT SELECT` on all columns to `anon`/`authenticated`.
- **Evidence:** `GET /rest/v1/profiles?select=*` with the anon key returned 54 rows with columns including `email`, `push_token`, `tos_agreed_at`, `referred_by`, `flagged_count`, `trial_started_at`, `subscription_source`, `petition_opt_in`. (Verified.)
- **Attack:** Scrape the user list; send arbitrary Expo push notifications to every device directly through `exp.host` using the harvested tokens (no Supabase involvement needed); phishing by email.
- **Fix:** Migration §2 revokes table-level SELECT and grants SELECT on an explicit column list. App now selects explicit columns everywhere (`lib/profileColumns.js`); the one client read of `push_token` (App.js) was redundant and removed.

### SEC-02 — Critical — Self-promotion to admin
- **Where:** `profiles` UPDATE policy allows own-row updates to any column; the existing `protect_profile_fields` trigger only guarded `is_pro`, `national_rank`, `caddy_rating`, and only on UPDATE. Admin RLS policies on `tournament_applications`, `sponsor_inquiries`, `course_certification_inquiries`, `courses` check `profiles.account_type = 'admin'`.
- **Evidence:** `UPDATE profiles SET account_type='admin' WHERE id=auth.uid()` succeeded for a simulated authenticated user before the migration and raised `42501` after it (dry-run tests A/B). The signup `upsert` also passes `account_type` from the client, and the INSERT policy only checks `id = auth.uid()`. (Verified.)
- **Fix:** Migration §3 — the trigger now fires on INSERT (forcing golfer / no entitlements / zero counters) and on UPDATE blocks changes to `account_type`, `is_pro`, `pro_expires_at`, `pro_trial_active`, `trial_started_at`, `subscription_source`, `referral_count`, `referral_reward_granted`, `referred_by`, `flagged_count`, `national_rank`, `pop_score`, `handicap_index`, `caddy_*` ranks, `id`, and `email` after first set. Server-side code (service role) is unaffected; `apply_referral` opts out via a transaction-local setting.

### SEC-03 — High — Self-granted Pro and referral credit
- Same root cause as SEC-02: `pro_expires_at` (what `useProAccess` and `user_has_pro_access()` check) and `referral_count` were client-writable. Pro is currently disabled by feature flag, so impact today is referral fraud; impact at Pro launch would have been free subscriptions. (Verified; fixed by the same trigger. `lib/referrals.js` no longer writes `referred_by` directly — the RPC does it.)

### SEC-04 — High — `send-push` lets any anon-key holder push anything to any user
- **Where:** `supabase/functions/send-push/index.ts` accepted the anon key or any header starting with `Bearer ey`; the "50 per recipient per hour" limit counted rows in `notifications` that the function never wrote.
- **Attack:** Spam or phishing notifications to every user; user enumeration via the `no_token` response.
- **Fix:** Rewritten. Requires a real user session (`auth.getUser`), validates and caps every field, writes the inbox row itself with `sender_id` stamped into `meta`, enforces 30/hour per sender and 50/hour per recipient against rows it wrote, and returns only `{sent: boolean}`. `config.toml` now sets `verify_jwt = true` for it.
- **Bonus functional fix:** the client used to insert `notifications` rows for *other* users, which RLS (`user_id = auth.uid()`) silently rejected — so comment, challenge and round-confirm notifications never reached inboxes. They do now.

### SEC-05 — High — `send-email` was an open relay from hello@clocked.golf
- **Where:** `supabase/functions/send-email/index.ts` accepted `{to, subject, html}` from any signed-in user. Sign-up is self-service.
- **Fix:** Rewritten. Recipient is always the caller's own verified address; only named server-side templates (`welcome`); all interpolations HTML-escaped; provider errors and configuration state no longer echoed. `SignUpScreen` sends `{template:'welcome', …}`.

### SEC-06 — Medium — Filter injection in `search-courses`, `SearchUsersScreen`, `ClockedSetupScreen`
- **Where:** user text interpolated into PostgREST `.or('name.ilike.%X%,…')` strings. In the edge function the query runs under the **service role**.
- **Impact:** extra filter clauses on `courses` (public data) / `profiles` (RLS still applies client-side); error-based probing. (Verified by code review; not exploited.)
- **Fix:** `sanitizeSearchText()` strips `, ( ) . % _ \ ' " \`` and caps length on the client; the edge function does the same.

### SEC-07 — Medium — Clients could self-verify rounds and rewrite participant scores
- **Where:** `rounds` INSERT accepted `verification_level` and `flagged_count` from the client; `round_participants` UPDATE (own row) allowed changing `hole_scores` / `total_points` / `total_score`, which feed the rating.
- **Fix:** Migration §4/§5 triggers: inserts are forced to `self_reported` with `flagged_count = 0`; clients cannot un-flag a round or change `verification_level`; participants may change only `status` / `confirmed_at`; basic plausibility bounds (holes ∈ {9,18}, 1–8 players, 1–1440 minutes). (Dry-run tests E, F, H1, H2.)
- **Residual:** scores themselves are still self-reported by the logging player. That is the product's trust model; a server-side scoring engine would be the next step.

### SEC-08 — Medium — Over-broad grants and an inert-but-dangerous course policy
- `anon`/`authenticated` held `TRUNCATE`, `TRIGGER`, `REFERENCES` on every table and full write privileges on read-only tables (`app_config`, `courses`, `course_time_pars`, `tournaments`, `tournament_results`). `courses` had a policy "Allow authenticated updates" (`auth.role() = 'authenticated'`) that only failed because UPDATE happened not to be granted. The admin course-certification feature was therefore also broken.
- **Fix:** Migration §6/§7 — policy dropped, UPDATE granted to `authenticated` (now scoped by the admin policy only), all write privileges removed from `anon`, TRUNCATE/TRIGGER/REFERENCES removed everywhere, defaults set for future tables.

### SEC-09 — Medium — Weak auth prefix check in `google-places` and `search-courses`
- `authHeader.startsWith('Bearer ey')` accepted literally `Bearer ey`. Both billable upstream calls (Google Places ×2, GolfCourseAPI) were reachable without the anon key.
- **Discovered during deployment:** the platform-injected `SUPABASE_ANON_KEY` inside the functions does *not* equal the legacy anon JWT embedded in the app (digest mismatch; an exact-match check returned 401 for the real app). The old "exact match" branches had therefore never been what admitted the app; only the prefix test was.
- **Fix:** `supabase/functions/_shared/callerKey.ts` — the token must decode as a Supabase JWT for this project ref with role `anon`/`authenticated` and an unexpired `exp`; if a `JWT_SECRET` secret is configured the HS256 signature is verified as well (recommended: `npx supabase secrets set JWT_SECRET=<project JWT secret from the dashboard>`). `google-places` additionally has gateway verification (`verify_jwt = true`). Input length caps; `google-places` only returns redirect targets on Google hosts. Verified live: real anon key → handler reached; `Bearer ey` → 401; forged claims for another project ref → 401.

### SEC-10 — Low — `tournament-apply` accepts unbounded unauthenticated input with the service role
- Reachable by design (website form). **Fix:** per-field length caps (120 / 2000 chars), email length cap, and `player1_username` is only stored when it matches the verified caller's own profile (so applicants can't "apply as" another member). Rate limiting still needs infrastructure (see §7).

### SEC-11 — Low — Supabase session persisted in unencrypted AsyncStorage
- `lib/supabase.js` uses AsyncStorage for the auth session (access + refresh tokens). On a non-jailbroken device this is sandboxed, but it is not in the Keychain. **Not changed** — moving to `expo-secure-store` with an encrypted-AsyncStorage adapter requires a native rebuild and a careful migration of existing sessions or every user is signed out. Plan in §7.

### SEC-12 — Low — Deep-link session injection
- `App.js` calls `auth.setSession` / `verifyOtp` with tokens taken from any `playthru:` URL. This is the standard Supabase magic-link flow; the practical risk is a login-CSRF where a crafted link signs the device into an attacker's account. Not changed; noted.

### SEC-13 — Info — Dependencies
- `npm audit` (production deps): 24 advisories → 4 after `npm audit fix` (non-breaking). All four are `zod` via `@expo/cli`, a build-time tool, and the only "fix" npm offers is a major downgrade of Expo. Not applicable at runtime. Lockfile is consistent (`npm ls` clean).

### Verified-OK items (no change needed)
`upsert_course` is executable by `service_role` only (not exposed via `/rpc`). `delete_user` deletes only `auth.uid()`. Storage: `avatars` is a public bucket with upload/update scoped to `{uid}/…`; the app uploads to `${uid}/avatar.ext`. `challenges`, `follows`, `course_follows`, `course_reviews`, `activity_*` policies are correctly owner-scoped. `check_round_rate_limit` (3 rounds / 12 h) is enforced server-side. No secrets other than the public anon key exist in the client, repo, or history checked.

## 4. Fixes implemented (files)

**Client**
- `lib/profileColumns.js` *(new)* — explicit profile column list + `sanitizeSearchText`.
- `context/AuthContext.js`, `screens/PublicProfileScreen.js` — explicit columns instead of `select('*')`.
- `App.js` — removed client read of `push_token`; removed dead imports.
- `lib/notifications.js` — `sendPushToUser` no longer inserts the inbox row client-side (server does); dead digest scheduler removed.
- `screens/FeedScreen.js`, `components/ChallengeButton.js`, `screens/ClockedRoundScreen.js` — use `sendPushToUser` only (the direct cross-user `notifications` inserts never worked).
- `screens/SearchUsersScreen.js`, `screens/ClockedSetupScreen.js` — sanitized search input.
- `screens/SignUpScreen.js` — template-based welcome email; HTML builder removed.
- `screens/AdminScreen.js` — "no profile" is treated as not-admin.
- `lib/referrals.js` — referral applied only via the RPC.
- `lib/popScore.js` — trimmed.
- `package.json`, `package-lock.json`, `app.json` — dependency and permission removal; audit fixes.

**Backend (edge functions — must be deployed, see §6)**
- `supabase/functions/send-push/index.ts`, `send-email/index.ts`, `google-places/index.ts` — rewritten; `supabase/functions/_shared/callerKey.ts` *(new)* — project-key check shared by the key-gated functions.
- `supabase/functions/search-courses/index.ts`, `tournament-apply/index.ts` — auth / validation patches.
- `supabase/config.toml` — explicit `verify_jwt` per function.

**Database (must be applied, see §6)**
- `supabase/migrations/20261027120000_security_hardening.sql`.

## 5. Testing results

| Check | Result |
|---|---|
| Migration dry-run (full file inside `BEGIN … ROLLBACK`) | Ran without error. Privilege assertions: anon/authenticated cannot read `email`/`push_token`, can read `username`/`bio`; anon cannot INSERT rounds; authenticated can; authenticated can UPDATE courses (admin policy only), cannot UPDATE app_config, cannot TRUNCATE; broad course policy gone; 3 triggers installed; `update_profile_safe` gone. |
| Guard behaviour as simulated `authenticated` client (rolled back) | A: insert claiming admin/pro/referral_count=99 → stored as golfer/false/0. B: update own `account_type` → `42501`. C: update of allowed fields incl. `bio`, first-time `email` → OK. D: `select email` → permission denied. E: round insert claiming `verified` → stored `self_reported`, `flagged_count 0`. F: `holes=7` → rejected. G: `increment_referral_count` through the guard → `referred_by` set, referrer count +1. H1: participant confirms own row → OK. H2: participant changes `total_points` → `42501`. I: anon can still read public profile columns. |
| **Live verification after apply + deploy** (anonymous, from outside) | `profiles?select=email,push_token` → 401 permission denied; `profiles?select=id,username,avatar_url` → 200; `profiles?select=*` → 401 (so old app builds must be updated); anon `INSERT rounds` → 401; `send-push` / `send-email` with anon key only → 401; `google-places` / `search-courses` with `Bearer ey` or a forged token → 401; with the real anon key both reach their handlers. With the simulator's genuine user session: `send-email` bogus template → 400 "Unknown template", `send-push` bad userId → 400 — i.e. session auth passes and validation rejects, as designed. The app relaunched on the migrated database and restored its session through the explicit-column profile read. |
| Production JS bundle (`expo export --platform ios`) | Succeeded: 4.2 MB Hermes bundle, exit 0, no warnings about missing modules. |
| Simulator smoke test (iPhone 17 Pro, dev client on the modified JS) | Cold launch restores the session through the explicit-column profile read; Feed, Profile (You) and Find Players render; a search for `ale,(x` (filter metacharacters) returns normal results instead of a PostgREST parse error. Writes were not exercised against production data. |
| `npm audit --omit=dev` | 4 high, all `zod` via `@expo/cli` (build tooling). |
| Existing test suite | None exists in the repo. Lint/type-check configs: none (JS project, `tsconfig` only extends Expo's base). |

## 6. Done on 2026-10-27, and what is still outstanding

**Applied / deployed**
- Migration `20261027120000_security_hardening.sql` applied to the production database through `supabase db query --linked` in a single transaction (the same path as the dry-run). `supabase db push` could not be used: the remote migration history contains 22 dashboard-applied versions that were never checked into the repo. Both local migrations were then recorded with `supabase migration repair --status applied`. To make `db push` usable again, run `npx supabase db pull` once and commit the resulting files.
- All five edge functions deployed (`send-push`, `send-email`, `google-places`, `search-courses`, `tournament-apply`) with the `verify_jwt` settings in `config.toml`.
- `'bio'` added to `PROFILE_COLUMNS` now that the column exists.

**Still outstanding**
1. **Ship the app build.** Old binaries do `select('*')` on profiles, which now fails → users on old builds will hit the loading gate and land on Welcome until they update. Also, the old client's `send-email` payload (`to/subject/html`) is rejected by the new function (harmless: welcome email just doesn't send for old builds). Requires a native rebuild anyway (two native packages and a permission were removed): `npx expo run:ios` / EAS build, then App Store submission with `min_build_number` in `app_config` bumped once the new build is out.
2. **Optional but recommended:** set `JWT_SECRET` as a function secret so `search-courses` verifies signatures rather than claims (see SEC-09).
3. **Course search 500** (found earlier, unrelated to security) still needs the function logs from the dashboard.
4. **Rotate nothing** — no private credential was found exposed. The anon key is public by design.

## 7. Operational recommendations

- **Rate limiting at the edge:** `tournament-apply`, `search-courses`, `google-places` have no per-IP limits. Options: Supabase's built-in edge rate limiting (if on a plan that has it), Cloudflare in front of the website calls, or a small `request_log` table keyed by IP hash checked in each function.
- **Secure session storage:** adopt the `expo-secure-store` + encrypted AsyncStorage adapter from Supabase's docs. Migrate by reading the existing plaintext session once, re-saving encrypted, then deleting the plaintext key, so nobody is signed out.
- **Auth settings (dashboard, not inspectable from here):** confirm email confirmation is on, set minimum password length ≥ 10, and keep Supabase's auth rate limits at defaults or stricter.
- **Server-side scoring:** the leaderboard trusts `rounds.hole_scores` written by the client. A `security definer` RPC that takes raw per-hole inputs and computes points/penalties would remove the last client-trusted integrity path.
- **Monitoring:** enable the dashboard's Security Advisor and Performance Advisor; alert on edge-function 4xx/5xx spikes; review `notifications` with the same `sender_id` at the rate cap.
- **Backups:** verify PITR / daily backups are enabled before the migration and before any future destructive change.
- **Keep the audit repeatable:** `supabase db query --linked` with the policy/grant queries used here can be scripted into CI.

## 8. Files changed

Added: `lib/profileColumns.js`, `supabase/functions/_shared/callerKey.ts`, `supabase/migrations/20261027120000_security_hardening.sql`, `docs/SECURITY_AUDIT_2026-10.md`.
Modified: `App.js`, `app.json`, `package.json`, `package-lock.json`, `context/AuthContext.js`, `lib/notifications.js`, `lib/popScore.js`, `lib/referrals.js`, `components/ChallengeButton.js`, `screens/AdminScreen.js`, `screens/ClockedRoundScreen.js`, `screens/ClockedSetupScreen.js`, `screens/FeedScreen.js`, `screens/PublicProfileScreen.js`, `screens/SearchUsersScreen.js`, `screens/SignUpScreen.js`, `supabase/config.toml`, `supabase/functions/{send-push,send-email,google-places,search-courses,tournament-apply}/index.ts`.
Deleted: `screens/LiveRoundScreen.js`, `screens/HomeScreen.js`, `screens/CoursesScreen.js`, `lib/gameEngines.js`, `lib/mockGreens.js`, `lib/geo.js`, `lib/handicap.js`, `components/RangefinderCard.js`, `hooks/useCurrentLocation.js`.
Untracked (kept on disk): `.env`, `supabase/.temp/*`.

## 9. Rollback

- **Code:** `git checkout main` (nothing on `main` was touched), or revert the merge commit.
- **Edge functions:** `git checkout main -- supabase/functions && npx supabase functions deploy …`. Note the old `send-email` payload shape differs; roll the app back with it.
- **Database:** the commented `ROLLBACK` block at the bottom of the migration restores grants and drops the new triggers. To restore the original trigger and function exactly, use the bodies below.

### Original database objects (for reference)

```sql
-- protect_sensitive_profile_fields (original, UPDATE-only)
CREATE OR REPLACE FUNCTION public.protect_sensitive_profile_fields() RETURNS trigger
LANGUAGE plpgsql SET search_path TO 'public' AS $$
begin
  if coalesce(auth.role(), '') not in ('authenticated','anon') then return NEW; end if;
  if NEW.is_pro        is distinct from OLD.is_pro
  or NEW.national_rank is distinct from OLD.national_rank
  or NEW.caddy_rating  is distinct from OLD.caddy_rating then
    raise exception 'Protected profile field cannot be modified directly';
  end if;
  return NEW;
end; $$;
-- trigger protect_profile_fields BEFORE UPDATE ON profiles

-- apply_referral (original) — identical to the new one minus the set_config line.

-- update_profile_safe (original, dropped; referenced non-existent columns)
CREATE OR REPLACE FUNCTION public.update_profile_safe(p_user_id uuid, p_username text DEFAULT NULL, p_full_name text DEFAULT NULL, p_bio text DEFAULT NULL, p_handicap numeric DEFAULT NULL, p_home_course text DEFAULT NULL, p_country text DEFAULT NULL, p_profile_picture_url text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF auth.uid() != p_user_id THEN RAISE EXCEPTION 'Unauthorized'; END IF;
  UPDATE profiles SET username = COALESCE(p_username, username), full_name = COALESCE(p_full_name, full_name),
    bio = COALESCE(p_bio, bio), handicap = COALESCE(p_handicap, handicap), home_course = COALESCE(p_home_course, home_course),
    country = COALESCE(p_country, country), profile_picture_url = COALESCE(p_profile_picture_url, profile_picture_url)
  WHERE id = p_user_id;
END; $$;

-- courses policy (dropped)
create policy "Allow authenticated updates" on public.courses for update using ((select auth.role()) = 'authenticated');
```
