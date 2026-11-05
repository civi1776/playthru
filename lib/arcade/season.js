// ─── lib/arcade/season.js — monthly arcade board + qualifiers ───────────────
// A season is a calendar month (Eastern time, to match the DB function). The
// board is each player's best qualifying run that month: intermediate or pro,
// nine holes. The top QUALIFY_TOP at month end earn a qualifier spot for the
// first Clocked event (frozen by close_arcade_season, admin-run).

import { supabase } from '../supabase';

export const QUALIFY_TOP = 10;
export const QUALIFYING_DIFFICULTIES = ['intermediate', 'pro'];

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];

// Calendar date in Eastern time as plain numbers. Hermes cannot parse the
// output of toLocaleString back into a Date, so use formatToParts instead and
// fall back to the device's local date if Intl is unavailable.
export function easternDate(d = new Date()) {
  try {
    const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', year: 'numeric', month: 'numeric', day: 'numeric' }).formatToParts(d);
    const get = t => Number(parts.find(x => x.type === t)?.value);
    const y = get('year'), m = get('month'), day = get('day');
    if (Number.isFinite(y) && Number.isFinite(m) && Number.isFinite(day)) return { y, m, day };
  } catch {}
  return { y: d.getFullYear(), m: d.getMonth() + 1, day: d.getDate() };
}

export function currentSeason(d = new Date()) {
  const { y, m } = easternDate(d);
  return `${y}-${String(m).padStart(2, '0')}`;
}
export function previousSeason(d = new Date()) {
  const [y, m] = currentSeason(d).split('-').map(Number);
  const pm = m === 1 ? 12 : m - 1, py = m === 1 ? y - 1 : y;
  return `${py}-${String(pm).padStart(2, '0')}`;
}
export function seasonLabel(season) {
  const [y, m] = String(season ?? '').split('-').map(Number);
  if (!Number.isFinite(y) || !MONTHS[m - 1]) return String(season ?? '');
  return `${MONTHS[m - 1]} ${y}`;
}
export function daysLeftInSeason(d = new Date()) {
  const { y, m, day } = easternDate(d);
  const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return Math.max(0, daysInMonth - day + 1);
}

export async function fetchSeasonBoard(season = currentSeason()) {
  const { data, error } = await supabase.rpc('arcade_season_board', { p_season: season });
  if (error) throw error;
  const rows = data ?? [];
  const ids = [...new Set(rows.map(r => r.user_id))];
  let pmap = {};
  if (ids.length) {
    const { data: profiles } = await supabase.from('profiles').select('id, full_name, username, avatar_url').in('id', ids);
    (profiles ?? []).forEach(p => { pmap[p.id] = p; });
  }
  return rows.map(r => ({ ...r, profile: pmap[r.user_id] }));
}

export async function fetchAllTimeBoard(limit = 10) {
  const { data: rows } = await supabase
    .from('arcade_scores')
    .select('id, user_id, points, total_seconds, difficulty, clocked_score, holes_under_clock')
    .order('points', { ascending: false }).order('total_seconds', { ascending: true })
    .limit(limit);
  const ids = [...new Set((rows ?? []).map(r => r.user_id))];
  let pmap = {};
  if (ids.length) {
    const { data: profiles } = await supabase.from('profiles').select('id, full_name, username, avatar_url').in('id', ids);
    (profiles ?? []).forEach(p => { pmap[p.id] = p; });
  }
  return (rows ?? []).map((r, i) => ({ ...r, rank: i + 1, profile: pmap[r.user_id] }));
}

export async function fetchMyQualifiers(userId) {
  if (!userId) return [];
  const { data } = await supabase.from('arcade_qualifiers').select('*').eq('user_id', userId).order('created_at', { ascending: false });
  return data ?? [];
}

// Admin: freeze last month. Returns the number of new qualifiers.
export async function closeSeason(season = previousSeason()) {
  const { data, error } = await supabase.rpc('close_arcade_season', { p_season: season });
  if (error) throw error;
  return data ?? 0;
}

// ─── The arcade board, one query for every slice ─────────────────────────────
// period      'month' | 'all'
// difficulty  'qualifying' (intermediate + pro, the board that feeds the
//             event) | 'all' | 'beginner' | 'intermediate' | 'pro'
// Best run per player, by points then time. Nine-hole runs only.
const DIFF_SETS = {
  qualifying: QUALIFYING_DIFFICULTIES,
  all: ['beginner', 'intermediate', 'pro'],
  beginner: ['beginner'], intermediate: ['intermediate'], pro: ['pro'],
};

async function attachProfiles(rows) {
  const ids = [...new Set(rows.map(r => r.user_id))];
  const pmap = {};
  if (ids.length) {
    const { data } = await supabase.from('profiles').select('id, full_name, username, avatar_url').in('id', ids);
    (data ?? []).forEach(p => { pmap[p.id] = p; });
  }
  return rows.map(r => ({ ...r, profile: pmap[r.user_id] }));
}

export async function fetchArcadeBoard({ period = 'month', difficulty = 'qualifying', limit = 50 } = {}) {
  const diffs = DIFF_SETS[difficulty] ?? DIFF_SETS.all;
  let q = supabase
    .from('arcade_scores')
    .select('id, user_id, points, total_seconds, difficulty, holes_under_clock, created_at')
    .eq('holes', 9)
    .in('difficulty', diffs)
    .order('points', { ascending: false })
    .order('total_seconds', { ascending: true })
    .limit(2000);
  if (period === 'month') {
    // Coarse server cut (a day early, UTC); exact month boundary is Eastern.
    const [y, m] = currentSeason().split('-').map(Number);
    q = q.gte('created_at', new Date(Date.UTC(y, m - 1, 1) - 86400000).toISOString());
  }
  const { data, error } = await q;
  if (error) throw error;
  const season = currentSeason();
  const best = {};
  for (const r of data ?? []) {
    if (period === 'month' && currentSeason(new Date(r.created_at)) !== season) continue;
    const b = best[r.user_id];
    if (!b || r.points > b.points || (r.points === b.points && r.total_seconds < b.total_seconds)) best[r.user_id] = r;
  }
  const rows = Object.values(best)
    .sort((a, b) => b.points - a.points || a.total_seconds - b.total_seconds || new Date(a.created_at) - new Date(b.created_at))
    .slice(0, limit)
    .map((r, i) => ({ ...r, rank: i + 1, score_id: r.id }));
  return attachProfiles(rows);
}

// One player's arcade record, for profiles. Nine-hole runs only.
export async function fetchArcadeProfile(userId) {
  const empty = { runs: 0, best: null, bestBy: {}, monthRank: null, monthBest: null };
  if (!userId) return empty;
  const { data } = await supabase
    .from('arcade_scores')
    .select('id, points, total_seconds, difficulty, holes_under_clock, created_at')
    .eq('user_id', userId).eq('holes', 9)
    .order('points', { ascending: false }).order('total_seconds', { ascending: true })
    .limit(500);
  const runs = data ?? [];
  if (!runs.length) return empty;
  const bestBy = {};
  for (const r of runs) if (!bestBy[r.difficulty]) bestBy[r.difficulty] = r;
  let monthRank = null, monthBest = null;
  try {
    const board = await fetchArcadeBoard({ period: 'month', difficulty: 'qualifying', limit: 500 });
    const mine = board.find(b => b.user_id === userId);
    if (mine) { monthRank = mine.rank; monthBest = mine; }
  } catch { /* best effort */ }
  return { runs: runs.length, best: runs[0], bestBy, monthRank, monthBest };
}

export default { QUALIFY_TOP, easternDate, currentSeason, previousSeason, seasonLabel, daysLeftInSeason, fetchSeasonBoard, fetchAllTimeBoard, fetchArcadeBoard, fetchArcadeProfile, fetchMyQualifiers, closeSeason };
