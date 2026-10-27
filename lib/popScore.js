// ─── lib/popScore.js ───────────────────────────────────────────────────────
// What remains of the legacy POP Score module. The pace-round scoring engine
// (calcPOPScoreCore, fraud heuristics, profile pop_score/national_rank
// writers) only served the retired LiveRoundScreen and was removed with it
// in the 2026-10 cleanup. Clocked rounds score through lib/clockedSport.js
// and lib/clockedRating.js.

// ─── Par 3 course detection ───────────────────────────────────────────────────
const PAR3_NAME_PATTERN = /par.?3|executive|short course/i;

export function isPar3Course(course) {
  if (!course) return false;
  if (course.is_par3 === true) return true;
  return PAR3_NAME_PATTERN.test(course.name ?? '');
}
