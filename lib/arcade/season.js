// ─── lib/arcade/season.js — monthly arcade board + qualifiers ───────────────
// A season is a calendar month (Eastern time, to match the DB function). The
// board is each player's best qualifying run that month: intermediate or pro,
// nine holes. The top QUALIFY_TOP at month end earn a qualifier spot for the
// first Clocked event (frozen by close_arcade_season, admin-run).

import { supabase } from '../supabase';

export const QUALIFY_TOP = 10;
export const QUALIFYING_DIFFICULTIES = ['intermediate', 'pro'];

export function currentSeason(d = new Date()) {
  const et = new Date(d.toLocaleString('en-US', { timeZone: 'America/New_York' }));
  return `${et.getFullYear()}-${String(et.getMonth() + 1).padStart(2, '0')}`;
}
export function previousSeason(d = new Date()) {
  const [y, m] = currentSeason(d).split('-').map(Number);
  const pm = m === 1 ? 12 : m - 1, py = m === 1 ? y - 1 : y;
  return `${py}-${String(pm).padStart(2, '0')}`;
}
export function seasonLabel(season) {
  const [y, m] = season.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}
export function daysLeftInSeason(d = new Date()) {
  const et = new Date(d.toLocaleString('en-US', { timeZone: 'America/New_York' }));
  const end = new Date(et.getFullYear(), et.getMonth() + 1, 1);
  return Math.max(0, Math.ceil((end - et) / 86400000));
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

export default { QUALIFY_TOP, currentSeason, previousSeason, seasonLabel, daysLeftInSeason, fetchSeasonBoard, fetchAllTimeBoard, fetchMyQualifiers, closeSeason };
