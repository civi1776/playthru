// ─── Clocked Rating — SCORING + CLOCK → Clocked Score ────────────────────────
// Pure, config-driven, unit-testable. Reads clocked rounds only.
// Higher-is-better, 0–100. Display as whole number; keep raw float internally.

// ─── Defaults (overridden by remote app_config) ─────────────────────────────

export const DEFAULT_RATING_WEIGHTS = { scoring: 0.65, clock: 0.35 };
export const DEFAULT_RATING_WINDOW = 20;
export const DEFAULT_SCORING_BAND = { low: 0, high: 3 }; // pts/hole range
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
// 100 × (holes under time par / total holes played).

export function computeClockComponent(roundStats) {
  if (!roundStats?.length) return null;

  let totalHoles = 0;
  let holesUnder = 0;

  for (const r of roundStats) {
    totalHoles += r.holesPlayed;
    holesUnder += r.holesUnderTimePar ?? 0;
  }

  if (totalHoles === 0) return null;

  return Math.max(0, Math.min(100, 100 * (holesUnder / totalHoles)));
}

// ─── Headline Clocked Score (0–100) ─────────────────────────────────────────

export function computeClockedScore(scoring, clock, weights = DEFAULT_RATING_WEIGHTS) {
  if (scoring == null && clock == null) return null;
  const s = scoring ?? 0;
  const c = clock ?? 50; // neutral seed when no clock data
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
  const clock = computeClockComponent(windowed);

  // Cold-start seed
  if (scoring == null && handicapIndex != null) {
    scoring = seedScoringFromHandicap(handicapIndex);
  }

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

  return { totalPlayerPoints, holesPlayed, holesUnderTimePar };
}
