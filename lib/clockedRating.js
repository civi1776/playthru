// ─── Clocked Rating — GAME + TEAMMATE → Clocked Score ───────────────────────
// Pure, config-driven, unit-testable. Reads clocked rounds only.
// Higher-is-better, 0–100. Display as whole number; keep raw float internally.

// ─── Defaults (overridden by remote app_config) ─────────────────────────────

export const DEFAULT_RATING_WEIGHTS = { game: 0.6, teammate: 0.4 };
export const DEFAULT_RATING_WINDOW = 20;
export const DEFAULT_GAME_BAND = { low: 0, high: 3 }; // pts/hole range
export const DEFAULT_TEAMMATE_WEIGHTS = { pace: 0.7, reliability: 0.3 };
export const DEFAULT_PROVISIONAL_ROUNDS = 5;

// ─── GAME (0–100) — sport skill ─────────────────────────────────────────────
// avgPts = mean(player's Modified Stableford points per hole) over window.
// Map to 0–100: GAME = clamp(avgPts / bandHigh × 100, 0, 100).

export function computeGame(roundStats, gameBand = DEFAULT_GAME_BAND) {
  if (!roundStats?.length) return null;

  const totalPts = roundStats.reduce((s, r) => s + r.totalPlayerPoints, 0);
  const totalHoles = roundStats.reduce((s, r) => s + r.holesPlayed, 0);

  if (totalHoles === 0) return null;

  const avgPts = totalPts / totalHoles;
  const raw = (avgPts - gameBand.low) / (gameBand.high - gameBand.low) * 100;
  return Math.max(0, Math.min(100, raw));
}

// ─── TEAMMATE (0–100) — value to a partnership ──────────────────────────────
// paceScore: 100 × (1 − avgTimePenalty / 3). No penalties → 100.
// reliabilityScore: 100 × completionRate. Default 100.
// TEAMMATE = w_pace × paceScore + w_reliability × reliabilityScore.

export function computeTeammate(roundStats, startedRounds, weights = DEFAULT_TEAMMATE_WEIGHTS) {
  if (!roundStats?.length) return null;

  // Pace: average absolute penalty per round (penalty is negative, use abs)
  const totalPenalty = roundStats.reduce((s, r) => s + Math.abs(r.totalPenalty), 0);
  const avgPenalty = totalPenalty / roundStats.length;
  const paceScore = Math.max(0, Math.min(100, 100 * (1 - avgPenalty / 3)));

  // Reliability: finished / started
  const finished = roundStats.length;
  const started = Math.max(finished, startedRounds ?? finished);
  const reliabilityScore = started > 0 ? 100 * (finished / started) : 100;

  return weights.pace * paceScore + weights.reliability * reliabilityScore;
}

// ─── Headline Clocked Score (0–100) ─────────────────────────────────────────

export function computeClockedScore(game, teammate, weights = DEFAULT_RATING_WEIGHTS) {
  if (game == null && teammate == null) return null;
  const g = game ?? 0;
  const t = teammate ?? 50; // neutral seed when no pace data
  return weights.game * g + weights.teammate * t;
}

// ─── Cold-start: seed GAME from golf handicap ──────────────────────────────
// Lower golf handicap → higher GAME. Scratch (0) ≈ ~67, 18 hcp ≈ ~33, 36 ≈ ~0.
// This is a rough seed — overwritten by actual clocked rounds quickly.

export function seedGameFromHandicap(handicapIndex) {
  if (handicapIndex == null || isNaN(handicapIndex)) return null;
  const hcp = Math.max(0, Number(handicapIndex));
  // Linear map: hcp 0 → 67, hcp 36 → 0, clamp [0, 100]
  const raw = 67 - (hcp / 36) * 67;
  return Math.max(0, Math.min(100, raw));
}

// ─── Full rating computation ────────────────────────────────────────────────
// Takes an array of clocked round summaries + config → returns the full rating.
//
// roundStats[]: { totalPlayerPoints, totalPenalty, holesPlayed }
//   (extracted from each clocked round's hole_scores for this player)
//
// Returns: { game, teammate, clockedScore, isProvisional, roundsUsed }

export function computeFullRating({
  roundStats,
  startedRounds,
  handicapIndex,
  ratingWeights = DEFAULT_RATING_WEIGHTS,
  gameBand = DEFAULT_GAME_BAND,
  teammateWeights = DEFAULT_TEAMMATE_WEIGHTS,
  provisionalRounds = DEFAULT_PROVISIONAL_ROUNDS,
  window = DEFAULT_RATING_WINDOW,
}) {
  // Slice to window
  const windowed = (roundStats ?? []).slice(0, window);
  const roundsUsed = windowed.length;
  const isProvisional = roundsUsed < provisionalRounds;

  // Compute components
  let game = computeGame(windowed, gameBand);
  const teammate = computeTeammate(windowed, startedRounds, teammateWeights);

  // Cold-start seed
  if (game == null && handicapIndex != null) {
    game = seedGameFromHandicap(handicapIndex);
  }

  const clockedScore = computeClockedScore(game, teammate, ratingWeights);

  return {
    game:          game != null ? Math.round(game * 10) / 10 : null,
    teammate:      teammate != null ? Math.round(teammate * 10) / 10 : null,
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
  let totalPenalty = 0;
  let holesPlayed = 0;

  for (const hole of holeScoresJson) {
    const player = hole.players?.find(p => p.name === playerName);
    if (player) {
      totalPlayerPoints += player.points ?? 0;
      holesPlayed++;
    }
    totalPenalty += hole.penalty ?? 0;
  }

  if (holesPlayed === 0) return null;

  return { totalPlayerPoints, totalPenalty, holesPlayed };
}
