// ─── Clocked Rating — SCORING + CLOCK → Clocked Score ────────────────────────
// Pure, config-driven, unit-testable. Reads clocked rounds only.
// Higher-is-better, 0–100. Display as whole number; keep raw float internally.

// ─── Defaults (overridden by remote app_config) ─────────────────────────────

import { isRankedClockedRound, fetchTestUserIds } from './rankingFilters';

export const DEFAULT_RATING_WEIGHTS = { scoring: 0.65, clock: 0.35 };
export const DEFAULT_RATING_WINDOW = 20;
export const DEFAULT_SCORING_BAND = { low: -1, high: 2 }; // pts/hole range
export const DEFAULT_PROVISIONAL_ROUNDS = 5;

// ─── SCORING COMPONENT (0–100) — avg points per hole ────────────────────────
// avgPts = mean(player's Clocked Scoring points per hole) over window.
// Map to 0–100: clamp(avgPts / bandHigh × 100, 0, 100).

export function computeScoringComponent(roundStats, scoringBand = DEFAULT_SCORING_BAND) {
  if (!roundStats?.length) return null;

  const totalPts = roundStats.reduce((s, r) => s + r.totalPlayerPoints, 0);
  const totalHoles = roundStats.reduce((s, r) => s + r.holesPlayed, 0);

  if (totalHoles === 0) return null;

  const avgPts = totalPts / totalHoles;
  const raw = (avgPts - scoringBand.low) / (scoringBand.high - scoringBand.low) * 100;
  return Math.max(0, Math.min(100, raw));
}

// ─── CLOCK COMPONENT (0–100) — % of holes finished under time par ───────────
// Weighted by difficulty: beginner=70%, intermediate=85%, pro=100%.

const DIFFICULTY_WEIGHT = { beginner: 0.70, intermediate: 0.85, pro: 1.00 };

export function computeClockComponent(roundStats) {
  if (!roundStats?.length) return null;

  let totalHoles = 0;
  let weightedHolesUnder = 0;

  for (const r of roundStats) {
    const weight = DIFFICULTY_WEIGHT[r.difficulty] ?? 0.85;
    totalHoles += r.holesPlayed;
    weightedHolesUnder += (r.holesUnderTimePar ?? 0) * weight;
  }

  if (totalHoles === 0) return null;

  return Math.max(0, Math.min(100, 100 * (weightedHolesUnder / totalHoles)));
}

// ─── Headline Clocked Score (0–100) ─────────────────────────────────────────

export function computeClockedScore(scoring, clock, weights = DEFAULT_RATING_WEIGHTS) {
  if (scoring == null && clock == null) return null;
  const s = scoring ?? 0;
  const c = clock ?? 60; // neutral seed when no clock data
  return weights.scoring * s + weights.clock * c;
}

// ─── Cold-start: seed SCORING from golf handicap ────────────────────────────
// Lower golf handicap → higher SCORING. Scratch (0) ~ 67, 18 hcp ~ 33, 36 ~ 0.
// Rough seed — overwritten by actual clocked rounds quickly.

export function seedScoringFromHandicap(handicapIndex) {
  if (handicapIndex == null || isNaN(handicapIndex)) return null;
  const hcp = Math.max(0, Number(handicapIndex));
  const raw = 67 - (hcp / 36) * 67;
  return Math.max(0, Math.min(100, raw));
}

// ─── Full rating computation ────────────────────────────────────────────────
// Takes an array of clocked round summaries + config → returns the full rating.
//
// roundStats[]: { totalPlayerPoints, holesPlayed, holesUnderTimePar }
//   (extracted from each clocked round's hole_scores for this player)
//
// Returns: { scoring, clock, clockedScore, isProvisional, roundsUsed }

export function computeFullRating({
  roundStats,
  handicapIndex,
  ratingWeights = DEFAULT_RATING_WEIGHTS,
  scoringBand = DEFAULT_SCORING_BAND,
  provisionalRounds = DEFAULT_PROVISIONAL_ROUNDS,
  window = DEFAULT_RATING_WINDOW,
}) {
  // Slice to window
  const windowed = (roundStats ?? []).slice(0, window);
  const roundsUsed = windowed.length;
  const isProvisional = roundsUsed < provisionalRounds;

  // Compute components
  let scoring = computeScoringComponent(windowed, scoringBand);
  let clock = computeClockComponent(windowed);

  // Cold-start seed
  if (scoring == null && handicapIndex != null) {
    scoring = seedScoringFromHandicap(handicapIndex);
  }

  // Base score fallback: all registered users get a neutral baseline
  // (67 × 0.65) + (60 × 0.35) = 43.55 + 21 = 64.55 → 65
  if (scoring == null) scoring = 67;
  if (clock == null) clock = 60;

  const clockedScore = computeClockedScore(scoring, clock, ratingWeights);

  return {
    scoring:       scoring != null ? Math.round(scoring * 10) / 10 : null,
    clock:         clock != null ? Math.round(clock * 10) / 10 : null,
    clockedScore:  clockedScore != null ? Math.round(clockedScore) : null,
    clockedScoreRaw: clockedScore,
    isProvisional,
    roundsUsed,
    roundsNeeded:  Math.max(0, provisionalRounds - roundsUsed),
  };
}

// ─── Extract round stats for a player from saved hole_scores ────────────────
// hole_scores is the JSONB array saved on each clocked round.
// playerName matches against the player names in each hole's players array.

export function extractPlayerRoundStats(holeScoresJson, playerName) {
  if (!holeScoresJson?.length || !playerName) return null;

  let totalPlayerPoints = 0;
  let holesPlayed = 0;
  let holesUnderTimePar = 0;

  for (const hole of holeScoresJson) {
    const player = hole.players?.find(p => p.name === playerName);
    if (player) {
      totalPlayerPoints += player.points ?? 0;
      holesPlayed++;
    }
    // Count holes where elapsed <= timePar
    if (hole.elapsed != null && hole.timePar != null && hole.elapsed <= hole.timePar) {
      holesUnderTimePar++;
    }
  }

  if (holesPlayed === 0) return null;

  // Extract difficulty from the first hole (same for all holes in a round)
  const difficulty = holeScoresJson[0]?.difficulty ?? 'intermediate';

  return { totalPlayerPoints, holesPlayed, holesUnderTimePar, difficulty };
}

// ─── Fetch + compute a single user's Clocked Score — the canonical path ─────
// Single source of truth for "what is this user's Clocked Score right now."
// Combines rounds they logged themselves with rounds they were a confirmed
// participant in (but didn't log), exactly as the Leaderboard and Profile
// screens already did independently — centralized here so every screen that
// shows a Clocked Score computes it the same way.
//
// `supabase` is the client, `userId`/`profile` identify the player. `profile`
// only needs `full_name`, `username`, and `handicap_index` — pass whatever
// you already have loaded to avoid a redundant fetch.
export async function fetchClockedRatingForUser(supabase, userId, profile) {
  if (!userId) {
    return computeFullRating({ roundStats: [], handicapIndex: null });
  }

  const playerName = profile?.full_name || profile?.username || 'Player';

  const { data: ownRounds } = await supabase
    .from('rounds')
    .select('id, hole_scores, round_format, holes, duration_minutes, flagged')
    .eq('user_id', userId)
    .eq('round_format', 'clocked')
    .not('hole_scores', 'is', null)
    .order('created_at', { ascending: false });
  const allOwnClocked = ownRounds ?? [];
  // Same rule as the public board: flagged rounds and rounds too quick to be
  // a real nine are practice. They stay in history and move no ranked number.
  const myOwnClocked = allOwnClocked.filter(r => !r.flagged && isRankedClockedRound(r));
  const practiceRounds = allOwnClocked.length - myOwnClocked.length;

  let participatedRounds = [];
  try {
    const { data: myParts } = await supabase
      .from('round_participants')
      .select('round_id, player_key, hole_scores, total_points')
      .eq('user_id', userId)
      .eq('status', 'confirmed');
    if (myParts?.length) {
      const partRoundIds = myParts
        .map(p => p.round_id)
        .filter(rid => !allOwnClocked.some(r => r.id === rid));
      if (partRoundIds.length) {
        const { data: partRounds } = await supabase
          .from('rounds')
          .select('id, hole_scores, round_format, holes, duration_minutes, flagged')
          .in('id', partRoundIds)
          .eq('round_format', 'clocked');
        participatedRounds = (partRounds ?? []).filter(r => !r.flagged && isRankedClockedRound(r)).map(r => {
          const part = myParts.find(p => p.round_id === r.id);
          return { ...r, _playerKey: part?.player_key };
        });
      }
    }
  } catch { /* silent — participation lookup is best-effort */ }

  const allClockedRounds = [...myOwnClocked, ...participatedRounds];
  const roundStats = allClockedRounds
    .map(r => {
      const key = r._playerKey ?? playerName;
      return extractPlayerRoundStats(r.hole_scores, key);
    })
    .filter(Boolean);

  return { ...computeFullRating({ roundStats, handicapIndex: profile?.handicap_index }), practiceRounds };
}

// ─── The Clocked board — one builder for every screen ───────────────────────
// The Rankings screen, the profile rank tile and the Today rank all read this,
// so a rank shown in one place is the rank shown in every other.
//
//   ranked   players with at least one counted Clocked round, best first.
//            Counted means: not flagged, long enough to be a real nine (see
//            rankingFilters), and not logged by a test account.
//   legacy   players whose only rounds are from before the clock. They are
//            listed under the ranked players and never mixed into them: a
//            legacy number has no clock component.
//   testIds  Set of test-account ids, so a screen can explain to a signed-in
//            test account why it is not listed.
//
// Entries are viewer-neutral: { userId, name, handle, avatarUrl, rating }.
// The result is memoised briefly and concurrent callers share one request.
const BOARD_TTL_MS = 20 * 1000;
let boardCache = null;
let boardCacheAt = 0;
let boardInflight = null;

export function invalidateClockedBoard() { boardCache = null; boardCacheAt = 0; }

async function buildClockedBoard(supabase) {
  const [testIds, clockedRes] = await Promise.all([
    fetchTestUserIds(supabase),
    supabase
      .from('rounds')
      .select('id, user_id, hole_scores, holes, duration_minutes, created_at')
      .eq('round_format', 'clocked')
      .eq('flagged', false)
      .not('hole_scores', 'is', null)
      .order('created_at', { ascending: false }),
  ]);
  if (clockedRes.error) throw clockedRes.error;
  const clockedRounds = (clockedRes.data ?? []).filter(isRankedClockedRound);

  const byUser = {};
  const roundMap = {};
  for (const r of clockedRounds) {
    (byUser[r.user_id] ??= []).push(r);
    roundMap[r.id] = r;
  }

  const roundIds = clockedRounds.map(r => r.id).filter(Boolean);
  if (roundIds.length) {
    const { data: parts } = await supabase
      .from('round_participants')
      .select('round_id, user_id, player_key')
      .eq('status', 'confirmed')
      .in('round_id', roundIds);
    for (const p of parts ?? []) {
      if (!p.user_id || !roundMap[p.round_id]) continue;
      const mine = (byUser[p.user_id] ??= []);
      if (!mine.some(r => r.id === p.round_id)) mine.push({ ...roundMap[p.round_id], _playerKey: p.player_key });
    }
  }

  // Legacy (pre-clock) rounds: stored 0..5 score, shown as 0..100.
  const legacyByUser = {};
  const { data: legacyRounds } = await supabase
    .from('rounds')
    .select('user_id, pop_score')
    .eq('round_format', 'pace')
    .eq('flagged', false)
    .not('pop_score', 'is', null);
  for (const r of legacyRounds ?? []) {
    if (byUser[r.user_id]) continue;             // has counted Clocked rounds: those rule
    (legacyByUser[r.user_id] ??= []).push(Number(r.pop_score));
  }

  const userIds = [...new Set([...Object.keys(byUser), ...Object.keys(legacyByUser)])].filter(id => !testIds.has(id));
  const profileMap = {};
  if (userIds.length) {
    const { data: profiles } = await supabase
      .from('profiles').select('id, full_name, username, handicap_index, avatar_url, hometown').in('id', userIds);
    (profiles ?? []).forEach(p => { profileMap[p.id] = p; });
  }

  const ranked = [];
  const legacy = [];
  for (const userId of userIds) {
    const prof = profileMap[userId];
    const name = prof?.full_name || prof?.username || 'Player';
    const base = { userId, name, handle: prof?.username ? `@${prof.username}` : '', avatarUrl: prof?.avatar_url ?? null, hometown: prof?.hometown ?? null };
    if (byUser[userId]) {
      const roundStats = byUser[userId]
        .map(r => extractPlayerRoundStats(r.hole_scores, r._playerKey ?? name))
        .filter(Boolean);
      // A player only stands on the board on rounds that parsed: zero usable
      // rounds would otherwise rank them on the cold-start baseline.
      if (!roundStats.length) continue;
      const rating = computeFullRating({ roundStats, handicapIndex: prof?.handicap_index });
      if (rating.clockedScore != null && rating.clockedScore > 0) ranked.push({ ...base, rating });
    } else {
      const scores = legacyByUser[userId].filter(Number.isFinite);
      if (!scores.length) continue;
      const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
      const clockedScore = Math.round(avg * 20);
      if (clockedScore > 0) legacy.push({ ...base, isLegacy: true, rating: { clockedScore, scoring: null, clock: null, roundsUsed: scores.length, isProvisional: false, roundsNeeded: 0 } });
    }
  }

  const byScore = (a, b) =>
    (b.rating.clockedScoreRaw ?? b.rating.clockedScore) - (a.rating.clockedScoreRaw ?? a.rating.clockedScore)
    || (b.rating.roundsUsed ?? 0) - (a.rating.roundsUsed ?? 0)
    || String(a.userId).localeCompare(String(b.userId));
  ranked.sort(byScore);
  legacy.sort(byScore);
  ranked.forEach((e, i) => { e.rank = i + 1; });

  return { ranked, legacy, testIds };
}

export async function fetchClockedBoard(supabase, { force = false } = {}) {
  if (!force && boardCache && Date.now() - boardCacheAt < BOARD_TTL_MS) return boardCache;
  if (boardInflight) return boardInflight;
  boardInflight = (async () => {
    const board = await buildClockedBoard(supabase);
    boardCache = board;
    boardCacheAt = Date.now();
    return board;
  })();
  try { return await boardInflight; } finally { boardInflight = null; }
}

// ─── Clocked rank for one user ───────────────────────────────────────────────
// The caller's position among ranked players on the Clocked board, or null
// when they have no counted Clocked round yet. Kept under its old name: the
// rank was once stored on the profile as `national_rank`, which is retired.
export async function computeNationalRank(supabase, userId) {
  if (!userId) return null;
  try {
    const { ranked } = await fetchClockedBoard(supabase);
    return ranked.find(e => e.userId === userId)?.rank ?? null;
  } catch {
    return null;
  }
}
