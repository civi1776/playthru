/*
 * SQL — run in Supabase:
 *
 * alter table rounds
 *   add column if not exists flagged             boolean default false,
 *   add column if not exists flagged_count       integer default 0,
 *   add column if not exists verification_level  text    default 'self_reported';
 *
 * alter table courses
 *   add column if not exists avg_time            numeric;
 *
 * alter table profiles
 *   add column if not exists gps_interest        boolean default false;
 *
 * -- Backfill existing profiles with weighted-average POPScore:
 * -- UPDATE profiles p
 * -- SET pop_score = sub.avg_score
 * -- FROM (
 * --   SELECT user_id,
 * --     ROUND(AVG(pop_score)::numeric, 1) as avg_score
 * --   FROM rounds
 * --   WHERE flagged = false AND pop_score IS NOT NULL
 * --   GROUP BY user_id
 * -- ) sub
 * -- WHERE p.id = sub.user_id;
 */

// ─── Par 3 course detection ───────────────────────────────────────────────────
const PAR3_NAME_PATTERN = /par.?3|executive|short course/i;

export function isPar3Course(course) {
  if (!course) return false;
  if (course.is_par3 === true) return true;
  return PAR3_NAME_PATTERN.test(course.name ?? '');
}

// ─── Course par (total) ───────────────────────────────────────────────────────
export function getCoursePar(holes, isPar3 = false) {
  if (isPar3) return holes === '9' ? 27 : 54;
  return holes === '9' ? 36 : 72;
}

// ─── Minimum credible round times (fraud detection) ───────────────────────────
// Cart minimums for 18 holes (walk adds 30, 9-hole = 55% of 18-hole)
const FRAUD_CART_18 = { 1: 90, 2: 120, 3: 140, 4: 160, 5: 180 };

export const MIN_TIMES_PAR3 = {
  '18': { 1: 45, 2: 60, 3: 60, 4: 75, 5: 90 },
  '9':  { 1: 25, 2: 33, 3: 33, 4: 40, 5: 50 },
};

// ─── Step 1 — Base expected times ────────────────────────────────────────────
export function getBaseExpected(holes, transport, isPar3 = false) {
  if (isPar3) {
    // Par 3 courses — same time for cart and walk (course is short)
    return holes === '9' ? 75 : 150;
  }
  if (holes === '18' && transport === 'Cart')    return 240;
  if (holes === '18' && transport === 'Walking') return 285;
  if (holes === '9'  && transport === 'Cart')    return 115;
  if (holes === '9'  && transport === 'Walking') return 140;
  return 240;
}

// ─── Caddy base expected (20 min faster — pros manage pace) ──────────────────
export function getBaseExpectedCaddy(holes, transport) {
  if (holes === '18' && transport === 'Cart')    return 220;
  if (holes === '18' && transport === 'Walking') return 260;
  if (holes === '9'  && transport === 'Cart')    return 107;
  if (holes === '9'  && transport === 'Walking') return 130;
  return 220;
}

export function getAdjustedExpectedCaddy(holes, transport, players) {
  const base = getBaseExpectedCaddy(holes, transport);
  const GROUP_ADJ = { 1: -15, 2: -5, 3: 0, 4: 10, 5: 20 };
  const adj = GROUP_ADJ[Number(players)] || 0;
  return holes === '9' ? base + Math.round(adj * 0.5) : base + adj;
}

// ─── Step 2 — Adjusted expected (group size + 9-hole scaling) ────────────────
export function getAdjustedExpected(holes, transport, players, isPar3 = false) {
  const base = getBaseExpected(holes, transport, isPar3);
  const GROUP_ADJ = { 1: -15, 2: -5, 3: 0, 4: 10, 5: 20 };
  const adj = GROUP_ADJ[Number(players)] || 0;
  return holes === '9' ? base + Math.round(adj * 0.5) : base + adj;
}

// ─── Step 3 — Fraud check ────────────────────────────────────────────────────
export function isFraudulent(durationMinutes, holes, players, isPar3 = false, transport = 'Cart', paceDelay = null) {
  if (paceDelay === 'constant') return false;
  if (isPar3) {
    const minTimes = MIN_TIMES_PAR3[holes] ?? MIN_TIMES_PAR3['18'];
    const minTime = minTimes[Number(players)] ?? (holes === '18' ? 75 : 40);
    return durationMinutes < minTime;
  }
  const base18 = FRAUD_CART_18[Number(players)] ?? 160;
  const min18  = transport === 'Walking' ? base18 + 30 : base18;
  const minTime = holes === '9' ? Math.round(min18 * 0.55) : min18;
  return durationMinutes < minTime;
}

// ─── Step 6 — Map ratio to POPScore ──────────────────────────────────────────
export function mapRatioToScore(ratio) {
  if (ratio >= 1.35) return 5.0;
  if (ratio >= 1.25) return 4.5 + ((ratio - 1.25) / (1.35 - 1.25)) * 0.5;
  if (ratio >= 1.15) return 4.0 + ((ratio - 1.15) / (1.25 - 1.15)) * 0.5;
  if (ratio >= 1.08) return 3.5 + ((ratio - 1.08) / (1.15 - 1.08)) * 0.5;
  if (ratio >= 1.00) return 3.2 + ((ratio - 1.00) / (1.08 - 1.00)) * 0.3;
  if (ratio >= 0.93) return 2.8 + ((ratio - 0.93) / (1.00 - 0.93)) * 0.4;
  if (ratio >= 0.85) return 2.2 + ((ratio - 0.85) / (0.93 - 0.85)) * 0.6;
  if (ratio >= 0.78) return 1.5 + ((ratio - 0.78) / (0.85 - 0.78)) * 0.7;
  return Math.max(1.0, 1.5 * (ratio / 0.78));
}

// ─── Caddy ratio → POPScore (shifted curve — pros earn higher scores) ─────────
export function mapRatioToScoreCaddy(ratio) {
  if (ratio >= 1.25) return 5.0;
  if (ratio >= 1.15) return 4.5 + ((ratio - 1.15) / (1.25 - 1.15)) * 0.5;
  if (ratio >= 1.08) return 4.0 + ((ratio - 1.08) / (1.15 - 1.08)) * 0.5;
  if (ratio >= 1.00) return 3.8 + ((ratio - 1.00) / (1.08 - 1.00)) * 0.2;
  if (ratio >= 0.93) return 3.2 + ((ratio - 0.93) / (1.00 - 0.93)) * 0.6;
  if (ratio >= 0.85) return 2.5 + ((ratio - 0.85) / (0.93 - 0.85)) * 0.7;
  if (ratio >= 0.78) return 1.5 + ((ratio - 0.78) / (0.85 - 0.78)) * 1.0;
  return Math.max(1.0, 1.5 * (ratio / 0.78));
}

// ─── Core calculation (sync — all inputs pre-resolved) ───────────────────────
// scoreVsHandicap: accepts new short keys ('beat','to_handicap','within_5','over_5')
//   AND legacy verbose labels for backward compatibility with existing rounds.
// courseAvgMinutes: courses.avg_time or null (falls back to adjusted_expected).
export function calcPOPScoreCore({
  durationMinutes,
  holes,
  transport,
  players,
  paceDelay,
  scoreVsHandicap,
  caddyLogged = false,
  courseAvgMinutes = null,
  isPar3 = false,
}) {
  // Steps 1+2 — caddy rounds use a faster baseline (pros manage pace)
  const adjusted_expected_minutes = caddyLogged
    ? getAdjustedExpectedCaddy(holes, transport, players)
    : getAdjustedExpected(holes, transport, players, isPar3);

  // Step 4 — pace delay forgiveness
  const courseSlownessFactor = Math.min(1.3, (courseAvgMinutes ?? adjusted_expected_minutes) / 240);
  const gap = durationMinutes - adjusted_expected_minutes;
  const forgivenessPct = { none: 0, few: 0.18, many: 0.42, constant: 0.72 }[paceDelay] || 0;
  const forgiven = gap > 0 ? gap * forgivenessPct * courseSlownessFactor : 0;
  const adjusted_actual_minutes = Math.round(durationMinutes - forgiven);

  // Step 5
  const ratio = adjusted_expected_minutes / adjusted_actual_minutes;

  // Step 6 — caddy rounds use the shifted curve for professionals
  let score = caddyLogged ? mapRatioToScoreCaddy(ratio) : mapRatioToScore(ratio);

  // Step 7 — score vs handicap bonus (handles both key formats)
  const scoreBonus = {
    beat: 0.15, to_handicap: 0.10, within_5: 0.05, over_5: 0.0,
    'Beat my handicap': 0.15, 'Played to my handicap': 0.10,
    'Within 5 of my handicap': 0.05, 'More than 5 over my handicap': 0.0,
  }[scoreVsHandicap] ?? 0;
  score += scoreBonus;

  // Step 8 — professional caddy bonus
  if (caddyLogged) score += 0.15;

  // Step 9
  const pop_score = Math.round(Math.min(5.0, Math.max(1.0, score)) * 10) / 10;

  return {
    pop_score,
    adjusted_expected_minutes,
    adjusted_actual_minutes,
    ratio: Math.round(ratio * 10000) / 10000,
  };
}

// ─── Sync preview (StepSummary — no fraud check, no Supabase) ────────────────
export function calcPOPScorePreview(durationMinutes, holes, transport, players, paceDelay, scoreVsHandicap, isPar3 = false) {
  return calcPOPScoreCore({
    durationMinutes,
    holes:           holes           || '18',
    transport:       transport       || 'Cart',
    players:         players         || '4',
    paceDelay:       paceDelay       || 'none',
    scoreVsHandicap: scoreVsHandicap || 'over_5',
    courseAvgMinutes: null,
    isPar3,
  }).pop_score;
}

// ─── Weighted rolling average across last 20 rounds ──────────────────────────
// Call after every successful round insert in LogScreen and LiveRoundScreen.
// Returns the new profilePopScore, or null if the user has no valid rounds.
export async function recalculateProfilePopScore(userId, supabase) {
  const { data: rounds } = await supabase
    .from('rounds')
    .select('pop_score, created_at')
    .eq('user_id', userId)
    .eq('flagged', false)
    .not('pop_score', 'is', null)
    .order('created_at', { ascending: false })
    .limit(20);

  if (!rounds || rounds.length === 0) return null;

  // Round 1 (most recent) gets weight 20, round 2 gets 19, etc.
  let weightedSum = 0;
  let totalWeight = 0;
  rounds.forEach((round, index) => {
    const weight = 20 - index;
    weightedSum += round.pop_score * weight;
    totalWeight += weight;
  });

  const profilePopScore = Math.round((weightedSum / totalWeight) * 10) / 10;

  await supabase.from('profiles').update({ pop_score: profilePopScore }).eq('id', userId);

  const { count } = await supabase
    .from('profiles')
    .select('*', { count: 'exact', head: true })
    .gt('pop_score', profilePopScore);
  const newRank = (count || 0) + 1;
  await supabase.from('profiles').update({ national_rank: newRank }).eq('id', userId);

  return profilePopScore;
}
