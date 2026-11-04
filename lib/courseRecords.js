// ─── lib/courseRecords.js — the course is the arena ─────────────────────────
// Strava's moat was never the feed, it was segments: a fixed stretch of road
// with a name on the top of it. Golf's segment is the course. Two records per
// course, both worth taking from someone:
//
//   points   best player total in a clocked round there
//   time     fastest clocked round there, per hole, so 9s and 18s compare
//
// A board needs two players to exist, which is why this works at our size
// when a feed does not.

import { supabase } from './supabase';
import { totalPointsFromHoleScores } from './clockedSport';

const ROUND_COLS = 'id, user_id, course_name, holes, duration_minutes, hole_scores, created_at';

// Every (player, round) result at a named course, newest first.
export async function fetchCourseResults({ courseName = null, limit = 400 } = {}) {
  let q = supabase
    .from('rounds')
    .select(ROUND_COLS)
    .eq('round_format', 'clocked')
    .not('course_name', 'is', null)
    .not('hole_scores', 'is', null)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (courseName) q = q.eq('course_name', courseName);

  const { data: rounds } = await q;
  if (!rounds?.length) return [];

  const ids = rounds.map(r => r.id);
  const { data: parts } = await supabase
    .from('round_participants')
    .select('round_id, user_id, player_key, total_points, status')
    .in('round_id', ids);

  const byRound = {};
  (parts ?? []).forEach(p => { (byRound[p.round_id] ??= []).push(p); });

  const out = [];
  for (const r of rounds) {
    const rows = byRound[r.id] ?? [];
    const perHole = r.holes > 0 && r.duration_minutes > 0 ? r.duration_minutes / r.holes : null;

    if (rows.length) {
      for (const p of rows) {
        if (!p.user_id) continue;
        const pts = p.total_points ?? totalPointsFromHoleScores(r.hole_scores);
        if (pts == null) continue;
        out.push({
          roundId: r.id, userId: p.user_id, name: p.player_key,
          course: r.course_name, points: pts, holes: r.holes,
          minutes: r.duration_minutes, perHole, date: r.created_at,
          confirmed: p.status === 'confirmed',
        });
      }
    } else {
      const pts = totalPointsFromHoleScores(r.hole_scores);
      if (pts == null) continue;
      out.push({
        roundId: r.id, userId: r.user_id, name: null,
        course: r.course_name, points: pts, holes: r.holes,
        minutes: r.duration_minutes, perHole, date: r.created_at, confirmed: true,
      });
    }
  }
  return out;
}

// Group results into one board per course.
export function boardsFromResults(results) {
  const byCourse = {};
  for (const r of results) {
    const b = (byCourse[r.course] ??= { course: r.course, results: [], players: new Set() });
    b.results.push(r);
    b.players.add(r.userId);
  }
  return Object.values(byCourse).map(b => {
    const scored = b.results.filter(r => r.points != null);
    const timed = b.results.filter(r => r.perHole != null && r.minutes >= 20);
    const bestPoints = scored.length
      ? scored.reduce((a, c) => (a == null || c.points > a.points || (c.points === a.points && new Date(c.date) < new Date(a.date)) ? c : a), null)
      : null;
    const bestTime = timed.length
      ? timed.reduce((a, c) => (a == null || c.perHole < a.perHole ? c : a), null)
      : null;
    // One entry per player, their best, for the board list.
    const best = {};
    for (const r of scored) {
      if (!best[r.userId] || r.points > best[r.userId].points) best[r.userId] = r;
    }
    const ranked = Object.values(best).sort((a, b2) => b2.points - a.points || (a.perHole ?? 1e9) - (b2.perHole ?? 1e9));
    return {
      course: b.course,
      playerCount: b.players.size,
      roundCount: b.results.length,
      bestPoints, bestTime, ranked,
      lastPlayed: b.results[0]?.date ?? null,
    };
  }).sort((a, b) => new Date(b.lastPlayed) - new Date(a.lastPlayed));
}

export async function fetchBoards(opts) {
  return boardsFromResults(await fetchCourseResults(opts));
}

// Attach display names to whatever boards you are about to render.
export async function hydrateNames(boards) {
  const ids = new Set();
  boards.forEach(b => {
    if (b.bestPoints?.userId) ids.add(b.bestPoints.userId);
    if (b.bestTime?.userId) ids.add(b.bestTime.userId);
    (b.ranked ?? []).slice(0, 10).forEach(r => ids.add(r.userId));
  });
  if (!ids.size) return {};
  const { data } = await supabase.from('profiles').select('id, full_name, username, avatar_url').in('id', [...ids]);
  const map = {};
  (data ?? []).forEach(p => { map[p.id] = p; });
  return map;
}

// Boards where this player holds either record, and boards they are on but
// do not lead — the two halves of "what is there to go take".
export function splitForUser(boards, userId) {
  const held = [], chasing = [];
  for (const b of boards) {
    if (b.playerCount < 2) continue;
    const onIt = b.ranked.some(r => r.userId === userId);
    if (!onIt) continue;
    if (b.bestPoints?.userId === userId || b.bestTime?.userId === userId) held.push(b);
    else chasing.push(b);
  }
  return { held, chasing };
}

// Minutes per hole across every clocked round at a course, against the
// course's own all-format average. This is the raw material for the course
// pitch: "rounds on the clock here finish N minutes quicker."
export async function fetchPaceDelta(courseName) {
  if (!courseName) return null;
  const { data } = await supabase
    .from('rounds')
    .select('holes, duration_minutes, round_format')
    .eq('course_name', courseName)
    .not('duration_minutes', 'is', null)
    .gte('duration_minutes', 20);
  const rows = data ?? [];
  const per = r => (r.holes > 0 ? r.duration_minutes / r.holes : null);
  const clocked = rows.filter(r => r.round_format === 'clocked').map(per).filter(Boolean);
  const other = rows.filter(r => r.round_format !== 'clocked').map(per).filter(Boolean);
  if (!clocked.length) return null;
  const mean = a => a.reduce((x, y) => x + y, 0) / a.length;
  const clockedPer = mean(clocked);
  const basePer = other.length ? mean(other) : null;
  return {
    clockedPer, basePer,
    clockedRounds: clocked.length,
    baseRounds: other.length,
    savedPer18: basePer != null ? (basePer - clockedPer) * 18 : null,
  };
}


// ─── Claiming a record ──────────────────────────────────────────────────────
// Called once, after a round saves. If this round beat the standing points
// record at the course, tell whoever just lost it. That notification is the
// retention mechanic the feed was never going to be: it reaches the one
// person who cares, instead of waiting for someone to scroll past it.
export async function claimCourseRecord({ courseName, userId, roundId, points, displayName }) {
  if (!courseName || !userId || points == null) return null;

  const results = (await fetchCourseResults({ courseName, limit: 200 }))
    .filter(r => r.roundId !== roundId && r.points != null);

  const previous = results.length
    ? results.reduce((a, c) => (a == null || c.points > a.points ? c : a), null)
    : null;

  if (previous && previous.points >= points) {
    return { took: false, standing: previous.points, holder: previous.userId };
  }

  // New record. Nobody to notify on the very first one.
  if (previous && previous.userId !== userId) {
    try {
      const { sendPushToUser } = await import('./notifications');
      await sendPushToUser(
        previous.userId,
        'Your course record is gone',
        `${displayName ?? 'Someone'} just posted ${points > 0 ? `+${points}` : points} at ${courseName}, past your ${previous.points > 0 ? `+${previous.points}` : previous.points}. Go take it back.`,
        'record_lost',
        { course_name: courseName, points, round_id: roundId },
      );
    } catch { /* push is best effort */ }
  }
  return { took: true, previous: previous?.points ?? null };
}

export default { fetchCourseResults, boardsFromResults, fetchBoards, hydrateNames, splitForUser, fetchPaceDelta, claimCourseRecord };
