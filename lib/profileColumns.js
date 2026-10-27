// ─── lib/profileColumns.js ─────────────────────────────────────────────────
// The columns of public.profiles the client is allowed to read.
//
// Sensitive columns (email, push_token, tos_agreed_at, referred_by, trial /
// subscription internals, flags, consent timestamps) are no longer SELECT-
// granted to the anon/authenticated roles — see the 2026-10-27 security
// hardening migration. Postgres column privileges make `select *` fail
// outright when any column is un-granted, so every profiles read must name
// its columns. Use this list wherever the app wants "the whole profile".

export const PROFILE_COLUMNS = [
  'id',
  'full_name',
  'first_name',
  'last_name',
  'username',
  'avatar_url',
  'hometown',
  'home_course',
  'home_state',
  'home_country',
  'bio',
  'handicap',
  'handicap_index',
  'handicap_trend',
  'avg_score',
  'typical_round_time',
  'pop_score',
  'national_rank',
  'account_type',
  'preferred_difficulty',
  'referral_code',
  'referral_count',
  'is_pro',
  'pro_expires_at',
  'created_at',
].join(', ');

// Strip PostgREST filter metacharacters from free-text search input before it
// is interpolated into an `.or('col.ilike.%x%,…')` filter string. Commas,
// parentheses and dots would otherwise let the user append filter clauses.
export function sanitizeSearchText(text, maxLen = 40) {
  return String(text ?? '')
    .replace(/[%_,().\\"'`]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLen);
}
