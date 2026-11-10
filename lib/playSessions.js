// ─── lib/playSessions.js — count every round that was started ───────────────
// One row the moment a round begins, arcade or Clocked; closed when it ends.
// "Rounds started per player" is the number a sponsor asks for first, and a
// completed-rounds table cannot answer it. Everything here is best effort
// and never blocks play: a lost row is a statistics problem, not a game one.

import { supabase } from './supabase';
import Constants from 'expo-constants';

const APP_VERSION = Constants?.expoConfig?.version ?? null;

export async function startPlaySession({ kind, difficulty = null, holesPlanned = null, courseName = null, players = null, seed = null, challengeId = null, meta = null }) {
  try {
    const { data: { user } = {} } = await supabase.auth.getUser();
    if (!user?.id) return null;
    const { data, error } = await supabase
      .from('play_sessions')
      .insert({
        user_id: user.id, kind, difficulty,
        holes_planned: holesPlanned, course_name: courseName, players,
        seed: seed != null ? String(seed) : null, challenge_id: challengeId,
        app_version: APP_VERSION, meta,
      })
      .select('id')
      .single();
    if (error) return null;
    return data?.id ?? null;
  } catch {
    return null;
  }
}

// outcome: 'completed' | 'abandoned'. Any field left out is left alone.
export async function endPlaySession(id, { outcome, holesCompleted, scoreId, roundId } = {}) {
  if (!id) return;
  const patch = {};
  if (outcome) patch.outcome = outcome;
  if (holesCompleted != null) patch.holes_completed = holesCompleted;
  if (scoreId) patch.score_id = scoreId;
  if (roundId) patch.round_id = roundId;
  if (!Object.keys(patch).length) return;
  try { await supabase.from('play_sessions').update(patch).eq('id', id); } catch { /* best effort */ }
}

// The arcade run on screen right now, if any, so the orphan sweep never
// closes the session that is being played.
let liveArcadeSessionId = null;
export function setLiveArcadeSession(id) { liveArcadeSessionId = id ?? null; }

/**
 * Close this player's arcade sessions that were started and never finished:
 * the app was killed, the screen was torn down, or the phone died. Runs at
 * launch and before each new run. Best effort; the server also sweeps old
 * ones, so a miss here only delays the tidy up.
 */
export async function closeOrphanArcadeSessions() {
  try {
    const { data: { session } = {} } = await supabase.auth.getSession();
    const uid = session?.user?.id;
    if (!uid) return;
    let q = supabase.from('play_sessions')
      .update({ outcome: 'abandoned' })
      .eq('user_id', uid).eq('kind', 'arcade').is('outcome', null);
    if (liveArcadeSessionId) q = q.neq('id', liveArcadeSessionId);
    await q;
  } catch { /* best effort */ }
}

export default { startPlaySession, endPlaySession, closeOrphanArcadeSessions, setLiveArcadeSession };
