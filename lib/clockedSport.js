// ─── Clocked Sport — Pure Scoring & Clock Engine ─────────────────────────────
// All functions are pure, config-driven, and unit-testable.
// No side effects, no network calls, no React dependencies.

// ─── Default Config (overridden by remote app_config at runtime) ─────────────

export const DEFAULT_SCORING_SCALE = {
  albatross_plus: 9,   // gross ≤ -3 vs par
  eagle:          6,   // gross −2
  birdie:         3,   // gross −1
  par:            1,   // gross  0
  bogey:          0,   // gross +1
  double_plus:   -2,   // gross +2 (max — player picks up here)
};

export const DEFAULT_CLOCK_COEFFICIENTS = {
  overhead_seconds:     150,
  travel_rate_walking:  0.72,  // seconds per yard
  travel_rate_riding:   0.52,
  player_adj_seconds:   20,    // extra seconds per additional player
};

// ─── Difficulty Time Par Lookup ──────────────────────────────────────────────
// Keys: difficulty → playerCount (1-5) → par (3,4,5). Values: seconds.
export const DIFFICULTY_TIME_PARS = {
  beginner: {
    1: { 3: 360, 4: 450, 5: 540 },
    2: { 3: 420, 4: 510, 5: 600 },
    3: { 3: 480, 4: 570, 5: 660 },
    4: { 3: 540, 4: 630, 5: 720 },
    5: { 3: 600, 4: 660, 5: 780 },
  },
  intermediate: {
    1: { 3: 240, 4: 300, 5: 360 },
    2: { 3: 270, 4: 330, 5: 420 },
    3: { 3: 330, 4: 420, 5: 480 },
    4: { 3: 390, 4: 480, 5: 570 },
    5: { 3: 450, 4: 540, 5: 660 },
  },
  pro: {
    1: { 3: 150, 4: 210, 5: 270 },
    2: { 3: 180, 4: 240, 5: 300 },
    3: { 3: 210, 4: 300, 5: 360 },
    4: { 3: 270, 4: 360, 5: 420 },
    5: { 3: 330, 4: 420, 5: 480 },
  },
};

export const DEFAULT_PENALTY_PARAMS = {
  interval_seconds:      30,
  penalty_per_interval: -0.5,
  max_penalty:          -3,
};

// Standard yardage per par when course data lacks hole yardage.
// Fed through the same timePar formula so every hole always has a countdown.
export const DEFAULT_YARDS_BY_PAR = { 3: 165, 4: 400, 5: 540, 6: 650 };

// ─── Handicap Stroke Allocation ──────────────────────────────────────────────
// Allocates strokes across holes using the hole handicap index.
// A player with courseHandicap 12 gets one stroke on the 12 hardest holes
// (handicap index 1–12). Handicaps > 18 wrap: a 20-handicap gets 2 strokes
// on the two hardest holes and 1 stroke on the rest.
//
// Returns an array of integers (strokes received per hole, typically 0, 1, or 2).

export function allocateHandicapStrokes(courseHandicap, holeHandicaps) {
  if (!courseHandicap || courseHandicap <= 0 || !holeHandicaps?.length) {
    return new Array(holeHandicaps?.length ?? 18).fill(0);
  }

  const n = holeHandicaps.length;
  const strokes = new Array(n).fill(0);
  let remaining = Math.round(courseHandicap);

  // Each full pass through 18 (or 9) indices awards one stroke per hole
  while (remaining > 0) {
    for (let idx = 1; idx <= n && remaining > 0; idx++) {
      const holePos = holeHandicaps.indexOf(idx);
      if (holePos !== -1) {
        strokes[holePos]++;
        remaining--;
      }
    }
    // Safety: if holeHandicaps doesn't contain all indices 1..n, break to avoid infinite loop
    if (remaining > 0 && holeHandicaps.every((_, i) => strokes[i] >= Math.ceil(courseHandicap / n) + 1)) {
      break;
    }
  }

  return strokes;
}

// ─── Points for a Single Hole ────────────────────────────────────────────────
// Gross scoring only. Caps at double bogey (par + 2), then maps to points.

export function pointsForHole(grossStrokes, par, scoringScale = DEFAULT_SCORING_SCALE) {
  if (grossStrokes == null || par == null) return null;

  const doubleBogey = par + 2;
  const capped = Math.min(grossStrokes, doubleBogey);
  const diff = capped - par;

  let points;
  let label;
  if (diff <= -3)     { points = scoringScale.albatross_plus; label = diff === -3 ? 'Albatross' : 'Albatross+'; }
  else if (diff === -2) { points = scoringScale.eagle;         label = 'Eagle'; }
  else if (diff === -1) { points = scoringScale.birdie;        label = 'Birdie'; }
  else if (diff === 0)  { points = scoringScale.par;           label = 'Par'; }
  else if (diff === 1)  { points = scoringScale.bogey;         label = 'Bogey'; }
  else                  { points = scoringScale.double_plus;   label = 'Double+'; }

  return {
    grossStrokes,
    capped,
    diff,
    label,
    points,
    pickedUp: grossStrokes >= doubleBogey,
  };
}

// ─── Resolve yardage for timePar ─────────────────────────────────────────────
// Returns { yards, yardageSource } — always a number, never null.

export function resolveYardage(holeYardage, par, defaultYardsByPar = DEFAULT_YARDS_BY_PAR) {
  if (holeYardage != null && holeYardage > 0) {
    return { yards: holeYardage, yardageSource: 'measured' };
  }
  return { yards: defaultYardsByPar[par] ?? defaultYardsByPar[4], yardageSource: 'par_default' };
}

// ─── Time Par Calculation ────────────────────────────────────────────────────
// Looks up time par from DIFFICULTY_TIME_PARS table by difficulty, playerCount, par.
// Falls back to yardage-based formula if lookup fails.

export function computeTimePar(yardage, par, playerCount, transport, difficulty = 'intermediate', officialSeconds = null, coefficients = DEFAULT_CLOCK_COEFFICIENTS, defaultYardsByPar = DEFAULT_YARDS_BY_PAR) {
  const DIFFICULTY_MULTIPLIER = { beginner: 1.31, intermediate: 1.0, pro: 0.75 };

  if (officialSeconds != null && officialSeconds > 0) {
    const mult = DIFFICULTY_MULTIPLIER[difficulty] ?? 1.0;
    return Math.round(officialSeconds * mult);
  }

  if (playerCount == null) return 0;

  const players = Math.min(5, Math.max(1, playerCount));
  const resolvedPar = par >= 5 ? 5 : par <= 3 ? 3 : 4;

  // Look up from difficulty table
  const tier = DIFFICULTY_TIME_PARS[difficulty] ?? DIFFICULTY_TIME_PARS.intermediate;
  const base = tier[players]?.[resolvedPar];
  if (base != null) return base;

  // Fallback to formula if lookup fails
  const { yards } = resolveYardage(yardage, par, defaultYardsByPar);
  const isWalking = transport === 'Walking' || transport === 'Walk';
  const travelRate = isWalking
    ? coefficients.travel_rate_walking
    : coefficients.travel_rate_riding;

  return Math.round(
    coefficients.overhead_seconds +
    (yards * travelRate) +
    (Math.max(0, players - 1) * coefficients.player_adj_seconds)
  );
}

// ─── Official Time Par Resolver ──────────────────────────────────────────────
// Extracts the official time par (seconds) from a course_time_pars.time_pars
// jsonb value for the given transport mode and player count.

export function officialTimeParFor(timeParsJson, transport, playerCount) {
  if (!timeParsJson) return null;
  const isWalking = transport === 'Walking' || transport === 'Walk';
  const bucket = isWalking ? timeParsJson.walking : timeParsJson.riding;
  if (!bucket) return null;
  const players = Math.min(5, Math.max(1, playerCount ?? 1));
  const v = bucket[String(players)];
  return (typeof v === 'number' && v > 0) ? v : null;
}

// ─── Time Penalty ────────────────────────────────────────────────────────────
// For every full `interval_seconds` over timePar: penalty_per_interval points.
// Capped at max_penalty. Returns 0 if under or at time par.

export function timePenalty(elapsedSeconds, timeParSeconds, penaltyParams = DEFAULT_PENALTY_PARAMS) {
  if (timeParSeconds == null || timeParSeconds <= 0) return 0;
  if (elapsedSeconds <= timeParSeconds) return 0;

  const overBy = elapsedSeconds - timeParSeconds;
  const intervals = Math.floor(overBy / penaltyParams.interval_seconds);
  const rawPenalty = intervals * penaltyParams.penalty_per_interval;

  return Math.max(penaltyParams.max_penalty, rawPenalty);
}

// ─── Score a Single Hole (full aggregation) ──────────────────────────────────
// Takes the group's gross strokes + elapsed time and returns the complete hole result.
// All scoring is gross — no handicap adjustment.
//
// players[]: { name, grossStrokes }
// holeData: { par, yardage } from the selected tee
// config: { scoringScale, clockCoefficients, penaltyParams, transport, playerCount, difficulty }

export function scoreHole(players, elapsedSeconds, holeData, config) {
  const { scoringScale, clockCoefficients, penaltyParams, transport, playerCount, difficulty, officialTimePars, holeNumber } = config;

  const par = holeData?.par;
  const rawYardage = holeData?.yardage ?? null;

  const { yards, yardageSource } = resolveYardage(rawYardage, par);
  const officialSeconds = officialTimeParFor(officialTimePars?.[holeNumber], transport, playerCount);
  const timeParSec = computeTimePar(rawYardage, par, playerCount, transport, difficulty, officialSeconds, clockCoefficients);
  const penalty = timePenalty(elapsedSeconds, timeParSec, penaltyParams);

  const playerResults = players.map(p => {
    const result = pointsForHole(p.grossStrokes, par, scoringScale);
    return { name: p.name, ...result };
  });

  const teamPointsBeforePenalty = playerResults.reduce((sum, r) => sum + (r?.points ?? 0), 0);
  const holeScore = teamPointsBeforePenalty + penalty;

  return {
    playerResults,
    teamPointsBeforePenalty,
    penalty,
    holeScore,
    timePar: timeParSec,
    elapsed: elapsedSeconds,
    par,
    yardage: rawYardage,
    yardsUsed: yards,
    yardageSource,
    timeParSource: officialSeconds != null ? 'certified' : 'tier',
  };
}

// ─── Summarize a Full Round ──────────────────────────────────────────────────
// Aggregates an array of hole results into round totals.

export function summarizeRound(holeResults) {
  if (!holeResults?.length) {
    return { totalScore: 0, totalTimePar: 0, totalElapsed: 0, totalPenalty: 0, playerTotals: [], holesPlayed: 0 };
  }

  const completed = holeResults.filter(h => h != null);

  const totalScore    = completed.reduce((s, h) => s + h.holeScore, 0);
  const totalTimePar  = completed.reduce((s, h) => s + (h.timePar ?? 0), 0);
  const totalElapsed  = completed.reduce((s, h) => s + h.elapsed, 0);
  const totalPenalty  = completed.reduce((s, h) => s + h.penalty, 0);

  // Build per-player totals
  const playerNames = completed[0]?.playerResults?.map(r => r.name) ?? [];
  const playerTotals = playerNames.map((name, idx) => ({
    name,
    totalPoints: completed.reduce((s, h) => s + (h.playerResults?.[idx]?.points ?? 0), 0),
  }));

  return {
    totalScore,
    totalTimePar,
    totalElapsed,
    totalPenalty,
    playerTotals,
    holesPlayed: completed.length,
  };
}

// ─── Format Badge ────────────────────────────────────────────────────────────

export function formatBadge(playerCount) {
  if (playerCount === 1) return 'SOLO';
  if (playerCount === 2) return '2-PLAYER AGGREGATE';
  if (playerCount === 3) return '3-PLAYER AGGREGATE';
  return `${playerCount}-PLAYER AGGREGATE`;
}

// ─── Format Elapsed Time ─────────────────────────────────────────────────────

export function formatSeconds(totalSeconds) {
  if (totalSeconds == null) return '--:--';
  const abs = Math.abs(totalSeconds);
  const m = Math.floor(abs / 60);
  const s = abs % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

export function formatSecondsLong(totalSeconds) {
  if (totalSeconds == null) return '--';
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  if (h > 0) return `${h}h ${String(m).padStart(2, '0')}m ${String(s).padStart(2, '0')}s`;
  return `${m}m ${String(s).padStart(2, '0')}s`;
}

// ─── Gross Cap (for UI: tell the player the max strokes before pickup) ───────

export function grossCapForHole(par) {
  return par + 2;
}
