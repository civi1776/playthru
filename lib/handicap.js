/*
 * SQL — add columns for Handicap Index tracking (run in Supabase):
 *
 * alter table rounds   add column if not exists course_rating numeric default 72.0;
 * alter table rounds   add column if not exists slope_rating  numeric default 113;
 * alter table rounds   add column if not exists differential  numeric;
 * alter table profiles add column if not exists handicap_index numeric;
 * alter table profiles add column if not exists handicap_trend text;
 */

import { supabase } from './supabase';

const COUNT_MAP = {
  3:1, 4:1, 5:1, 6:2, 7:2, 8:2, 9:3, 10:3,
  11:4, 12:4, 13:5, 14:5, 15:6, 16:6, 17:7, 18:8, 19:9, 20:10,
};

// WHS score differential
export function calcDifferential(adjustedGrossScore, courseRating = 72.0, slopeRating = 113) {
  return parseFloat(((adjustedGrossScore - courseRating) * (113 / slopeRating)).toFixed(1));
}

// Estimate adjusted gross score from score_vs_handicap text for the log-after-the-fact flow
export function estimateGrossScore(scoreVsHandicap, handicap, holes) {
  const hcp  = handicap ?? 18;
  const par  = holes === '9' ? 36 : 72;
  const base = holes === '9' ? Math.round(hcp / 2) : hcp;
  let offset;
  if      (scoreVsHandicap === 'Beat my handicap')             offset = -2;
  else if (scoreVsHandicap === 'Played to my handicap')        offset =  0;
  else if (scoreVsHandicap === 'Within 5 of my handicap')      offset =  3;
  else                                                          offset =  6; // 'More than 5 over'
  return par + base + offset;
}

// WHS Handicap Index from last 20 rounds with differentials
export async function calcHandicapIndex(userId) {
  const { data: rounds } = await supabase
    .from('rounds')
    .select('differential, created_at')
    .eq('user_id', userId)
    .not('differential', 'is', null)
    .order('created_at', { ascending: false })
    .limit(20);

  if (!rounds || rounds.length < 3) return null;

  const n     = Math.min(rounds.length, 20);
  const count = COUNT_MAP[n] || 10;
  const sorted = [...rounds].sort((a, b) => a.differential - b.differential);
  const best   = sorted.slice(0, count);
  const avg    = best.reduce((sum, r) => sum + r.differential, 0) / best.length;
  return Math.max(0, Math.min(54, Math.round(avg * 0.96 * 10) / 10));
}

// Full pipeline: save differential to round → recalculate handicap index → update profile
export async function updateHandicapAfterRound(userId, roundId, adjustedGrossScore, courseRating = 72.0, slopeRating = 113) {
  try {
    const differential = calcDifferential(adjustedGrossScore, courseRating, slopeRating);

    await supabase.from('rounds').update({
      differential,
      course_rating: courseRating,
      slope_rating:  slopeRating,
    }).eq('id', roundId);

    const newIndex = await calcHandicapIndex(userId);
    if (newIndex === null) return;

    const { data: prev } = await supabase
      .from('profiles').select('handicap_index').eq('id', userId).single();

    let trend = 'stable';
    if (prev?.handicap_index != null) {
      if (newIndex < prev.handicap_index) trend = 'improving';
      else if (newIndex > prev.handicap_index) trend = 'rising';
    }

    await supabase.from('profiles').update({
      handicap_index: newIndex,
      handicap_trend: trend,
    }).eq('id', userId);

  } catch (e) {
    // silent fail
  }
}
