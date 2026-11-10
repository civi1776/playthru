// ─── lib/rankingFilters.js — who and what counts on a public board ──────────
// One place for the two rules every ranking shares:
//
//   1. Test accounts (dev, App Review, internal) are never ranked.
//   2. A Clocked round only counts toward the Clocked Score when it could
//      have been a real nine. Anything quicker is practice: it stays in the
//      player's history, it just moves no ranked number.
//
// No imports on purpose: the Supabase client is passed in, so the rating
// module can use this from scripts and tests as well as from the app.

// The floor is the one already used for course records and pace stats: no
// one walks, let alone plays, nine holes in under 20 minutes. Eighteen
// doubles it. Raise this once real events show what a fast nine looks like.
export const MIN_RANKED_MINUTES_NINE = 20;

export function minRankedMinutes(holes) {
  return (Number(holes) >= 18 ? 2 : 1) * MIN_RANKED_MINUTES_NINE;
}

// `r` needs `holes` and `duration_minutes`. A round with no duration has no
// clock evidence, so it does not count either.
export function isRankedClockedRound(r) {
  const d = Number(r?.duration_minutes);
  if (!Number.isFinite(d) || d <= 0) return false;
  return d >= minRankedMinutes(r?.holes ?? 9);
}

// ─── Test accounts ───────────────────────────────────────────────────────────
// `profiles.is_test` is the source of truth. Until that column exists on the
// project this build talks to, fall back to the two known handles so the
// boards are clean either way.
const FALLBACK_TEST_USERNAMES = ['development', 'alexreviewer'];
const TEST_IDS_TTL_MS = 10 * 60 * 1000;
let testIds = null;
let testIdsAt = 0;
let testIdsInflight = null;

export async function fetchTestUserIds(supabase) {
  if (testIds && Date.now() - testIdsAt < TEST_IDS_TTL_MS) return testIds;
  if (testIdsInflight) return testIdsInflight;
  testIdsInflight = (async () => {
    let ids = null;
    try {
      const { data, error } = await supabase.from('profiles').select('id').eq('is_test', true);
      if (!error) ids = (data ?? []).map(r => r.id);
    } catch { /* fall through */ }
    if (ids == null) {
      try {
        const { data } = await supabase.from('profiles').select('id').in('username', FALLBACK_TEST_USERNAMES);
        ids = (data ?? []).map(r => r.id);
      } catch { ids = []; }
    }
    testIds = new Set(ids);
    testIdsAt = Date.now();
    return testIds;
  })();
  try { return await testIdsInflight; } finally { testIdsInflight = null; }
}

export default { MIN_RANKED_MINUTES_NINE, minRankedMinutes, isRankedClockedRound, fetchTestUserIds };
