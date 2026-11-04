// ─── lib/headToHead.js — a player's rounds, and their record against people ──
// Two things a profile needs that the rounds table alone doesn't give you:
//
//   fetchPlayerRounds(userId, name)   every round the player appears in — the
//                                     ones they logged plus the ones a friend
//                                     logged with them on the card — each
//                                     tagged with that player's own points
//   fetchHeadToHead(me, them)         the record between the viewer and the
//                                     player: rounds played together, course
//                                     challenges, arcade duels
//
// `recordFromRounds` turns a player's rounds into a win–loss–tie record
// against everyone they've shared a card with, linked account or not.

import { supabase } from './supabase';
import { extractPlayerRoundStats } from './clockedRating';

const ROUND_COLS = 'id, user_id, course_name, created_at, holes, duration_minutes, round_format, difficulty, players, transport, pop_score, hole_scores';

export function playerPointsIn(holeScores, name) {
  const st = extractPlayerRoundStats(holeScores, name);
  return st ? st.totalPlayerPoints : null;
}

// Everyone else on the card, with their total points.
export function opponentsIn(holeScores, name) {
  const totals = {};
  for (const hole of holeScores ?? []) {
    for (const p of hole.players ?? []) {
      if (!p?.name || p.name === name) continue;
      totals[p.name] = (totals[p.name] ?? 0) + (p.points ?? 0);
    }
  }
  return Object.entries(totals).map(([opponent, points]) => ({ opponent, points }));
}

// Win–loss–tie against playing partners across clocked rounds. One result per
// opponent per round, so a threesome is two results.
export function recordFromRounds(rounds) {
  let wins = 0, losses = 0, ties = 0, games = 0;
  for (const r of rounds ?? []) {
    if (r.round_format !== 'clocked' || !r.hole_scores?.length || r._pts == null) continue;
    for (const o of opponentsIn(r.hole_scores, r._key)) {
      games++;
      if (r._pts > o.points) wins++;
      else if (r._pts < o.points) losses++;
      else ties++;
    }
  }
  return { wins, losses, ties, games };
}

function tagRound(r, key, confirmed) {
  const pts = r.round_format === 'clocked' ? playerPointsIn(r.hole_scores, key) : null;
  return { ...r, _key: key, _confirmed: confirmed, _pts: pts };
}

// Own logs + linked participations, newest first.
export async function fetchPlayerRounds(userId, fallbackName, limit = 40) {
  if (!userId) return [];
  const [{ data: own }, { data: parts }] = await Promise.all([
    supabase.from('rounds').select(ROUND_COLS).eq('user_id', userId).order('created_at', { ascending: false }).limit(limit),
    supabase.from('round_participants').select('round_id, player_key, status').eq('user_id', userId),
  ]);
  const partByRound = {};
  (parts ?? []).forEach(p => { partByRound[p.round_id] = p; });

  const ownRounds = (own ?? []).map(r => tagRound(r, partByRound[r.id]?.player_key ?? fallbackName, true));
  const ownIds = new Set(ownRounds.map(r => r.id));
  const otherIds = Object.keys(partByRound).filter(id => !ownIds.has(id));

  let theirs = [];
  if (otherIds.length) {
    const { data } = await supabase.from('rounds').select(ROUND_COLS).in('id', otherIds).order('created_at', { ascending: false }).limit(limit);
    theirs = (data ?? []).map(r => {
      const p = partByRound[r.id];
      return tagRound(r, p?.player_key ?? fallbackName, p?.status === 'confirmed');
    });
  }
  return [...ownRounds, ...theirs].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
}

// The record between two players.
//   rounds together  → wins/losses/ties (confirmed by both), pendingConfirm
//   course challenges→ challenges.{wins, losses, pending}
//   arcade duels     → arcade.{wins, losses, ties, open}   (table may not exist yet)
export async function fetchHeadToHead(meId, themId, meName, themName) {
  const empty = { wins: 0, losses: 0, ties: 0, pendingConfirm: 0, matchups: [], challenges: { wins: 0, losses: 0, pending: 0 }, arcade: { wins: 0, losses: 0, ties: 0, open: 0 } };
  if (!meId || !themId || meId === themId) return empty;
  const out = { ...empty, challenges: { ...empty.challenges }, arcade: { ...empty.arcade } };

  // ── Rounds on the same card ──
  try {
    const { data: parts } = await supabase
      .from('round_participants')
      .select('round_id, user_id, player_key, status')
      .in('user_id', [meId, themId]);
    const byRound = {};
    for (const p of parts ?? []) {
      byRound[p.round_id] = byRound[p.round_id] ?? {};
      byRound[p.round_id][p.user_id] = p;
    }
    const ids = Object.keys(byRound);
    if (ids.length) {
      const { data: rounds } = await supabase
        .from('rounds')
        .select('id, user_id, course_name, created_at, holes, round_format, hole_scores')
        .in('id', ids)
        .eq('round_format', 'clocked')
        .not('hole_scores', 'is', null)
        .order('created_at', { ascending: false });
      for (const r of rounds ?? []) {
        const mine = byRound[r.id][meId] ?? (r.user_id === meId ? { player_key: meName, status: 'confirmed' } : null);
        const theirs = byRound[r.id][themId] ?? (r.user_id === themId ? { player_key: themName, status: 'confirmed' } : null);
        if (!mine || !theirs) continue;
        const myPts = playerPointsIn(r.hole_scores, mine.player_key ?? meName);
        const theirPts = playerPointsIn(r.hole_scores, theirs.player_key ?? themName);
        if (myPts == null || theirPts == null) continue;
        const confirmed = mine.status === 'confirmed' && theirs.status === 'confirmed';
        out.matchups.push({ roundId: r.id, course: r.course_name, date: r.created_at, holes: r.holes, myPts, theirPts, confirmed });
        if (!confirmed) { out.pendingConfirm++; continue; }
        if (myPts > theirPts) out.wins++; else if (myPts < theirPts) out.losses++; else out.ties++;
      }
    }
  } catch { /* best effort */ }

  // ── Course challenges ──
  try {
    const { data } = await supabase
      .from('challenges')
      .select('challenger_id, challenged_id, winner_id, status')
      .or(`and(challenger_id.eq.${meId},challenged_id.eq.${themId}),and(challenger_id.eq.${themId},challenged_id.eq.${meId})`);
    for (const c of data ?? []) {
      if (c.winner_id === meId) out.challenges.wins++;
      else if (c.winner_id === themId) out.challenges.losses++;
      else if (c.status === 'pending' || c.status === 'accepted') out.challenges.pending++;
    }
  } catch { /* best effort */ }

  // ── Arcade duels ──
  try {
    const { data, error } = await supabase
      .from('arcade_challenges')
      .select('challenger_id, challenged_id, winner_id, status')
      .or(`and(challenger_id.eq.${meId},challenged_id.eq.${themId}),and(challenger_id.eq.${themId},challenged_id.eq.${meId})`);
    if (!error) {
      for (const c of data ?? []) {
        if (c.status === 'complete') {
          if (c.winner_id === meId) out.arcade.wins++;
          else if (c.winner_id === themId) out.arcade.losses++;
          else out.arcade.ties++;
        } else if (c.status === 'pending' || c.status === 'accepted') out.arcade.open++;
      }
    }
  } catch { /* table lands with the arcade seasons migration */ }

  return out;
}

export default { playerPointsIn, opponentsIn, recordFromRounds, fetchPlayerRounds, fetchHeadToHead };
