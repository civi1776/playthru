// ─── Clocked Config — Remote config fetch + cache ────────────────────────────
// Fetches scoring scale, clock coefficients, and penalty params from app_config.
// Falls back to engine defaults if fetch fails. Cached in memory per session.

import { supabase } from './supabase';
import {
  DEFAULT_SCORING_SCALE,
  DEFAULT_CLOCK_COEFFICIENTS,
  DEFAULT_PENALTY_PARAMS,
} from './clockedSport';

let _cache = null;

function safeParse(jsonStr, fallback) {
  try { return JSON.parse(jsonStr); } catch { return fallback; }
}

export async function fetchClockedConfig() {
  if (_cache) return _cache;

  try {
    const { data } = await supabase
      .from('app_config')
      .select('key, value')
      .in('key', ['clocked_scoring_scale', 'clocked_clock_coefficients', 'clocked_penalty_params']);

    const map = {};
    (data ?? []).forEach(row => { map[row.key] = row.value; });

    _cache = {
      scoringScale:      map.clocked_scoring_scale      ? { ...DEFAULT_SCORING_SCALE,      ...safeParse(map.clocked_scoring_scale,      {}) } : DEFAULT_SCORING_SCALE,
      clockCoefficients: map.clocked_clock_coefficients  ? { ...DEFAULT_CLOCK_COEFFICIENTS, ...safeParse(map.clocked_clock_coefficients, {}) } : DEFAULT_CLOCK_COEFFICIENTS,
      penaltyParams:     map.clocked_penalty_params      ? { ...DEFAULT_PENALTY_PARAMS,     ...safeParse(map.clocked_penalty_params,     {}) } : DEFAULT_PENALTY_PARAMS,
    };
  } catch {
    _cache = {
      scoringScale:      DEFAULT_SCORING_SCALE,
      clockCoefficients: DEFAULT_CLOCK_COEFFICIENTS,
      penaltyParams:     DEFAULT_PENALTY_PARAMS,
    };
  }

  return _cache;
}

export function getClockedConfigSync() {
  return _cache ?? {
    scoringScale:      DEFAULT_SCORING_SCALE,
    clockCoefficients: DEFAULT_CLOCK_COEFFICIENTS,
    penaltyParams:     DEFAULT_PENALTY_PARAMS,
  };
}

export function invalidateClockedConfigCache() {
  _cache = null;
}
