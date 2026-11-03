// ─── lib/arcade/challenges.js — friend duels in the arcade ──────────────────
// Same seed (same nine holes), same difficulty, seven days. Each player posts
// one run; the database trigger settles it (points, then time). Pushes go
// through send-push so the inbox row and the device notification both land.

import { supabase } from '../supabase';
import { sendPushToUser } from '../notifications';
import { randomSeed } from './course';

export async function createArcadeChallenge({ me, myUsername, opponentId, opponentUsername, difficulty = 'intermediate' }) {
  const seed = String(randomSeed());
  const { data, error } = await supabase
    .from('arcade_challenges')
    .insert({ challenger_id: me, challenged_id: opponentId, seed, difficulty })
    .select('*')
    .single();
  if (error) throw error;
  const handle = myUsername ? `@${myUsername}` : 'A friend';
  await sendPushToUser(
    opponentId,
    'Arcade challenge',
    `${handle} challenged you to nine holes in the Arcade (${difficulty}). Same course, seven days. Beat their run.`,
    'arcade_challenge',
    { challenge_id: data.id, challenger_id: me, challenger_username: myUsername ?? '', difficulty },
  );
  return data;
}

export async function fetchMyArcadeChallenges(me) {
  if (!me) return [];
  const { data } = await supabase
    .from('arcade_challenges')
    .select('*')
    .or(`challenger_id.eq.${me},challenged_id.eq.${me}`)
    .order('created_at', { ascending: false })
    .limit(30);
  const rows = data ?? [];
  const ids = [...new Set(rows.flatMap(r => [r.challenger_id, r.challenged_id]))].filter(id => id !== me);
  let pmap = {};
  if (ids.length) {
    const { data: profiles } = await supabase.from('profiles').select('id, full_name, username, avatar_url').in('id', ids);
    (profiles ?? []).forEach(p => { pmap[p.id] = p; });
  }
  const now = Date.now();
  return rows.map(r => {
    const iAmChallenger = r.challenger_id === me;
    const opponentId = iAmChallenger ? r.challenged_id : r.challenger_id;
    const myScoreId = iAmChallenger ? r.challenger_score_id : r.challenged_score_id;
    const theirScoreId = iAmChallenger ? r.challenged_score_id : r.challenger_score_id;
    const expired = r.status !== 'complete' && new Date(r.expires_at).getTime() < now;
    return {
      ...r, iAmChallenger, opponentId, opponent: pmap[opponentId], myScoreId, theirScoreId, expired,
      myPoints: iAmChallenger ? r.challenger_points : r.challenged_points,
      theirPoints: iAmChallenger ? r.challenged_points : r.challenger_points,
      mySeconds: iAmChallenger ? r.challenger_seconds : r.challenged_seconds,
      theirSeconds: iAmChallenger ? r.challenged_seconds : r.challenger_seconds,
      // What I should do next.
      action: r.status === 'complete' ? 'done'
        : expired ? 'expired'
        : r.status === 'declined' ? 'declined'
        : r.status === 'pending' ? (iAmChallenger ? (myScoreId ? 'waiting' : 'play') : 'respond')
        : /* accepted */ (myScoreId ? 'waiting' : 'play'),
    };
  });
}

export async function respondToArcadeChallenge(ch, me, myUsername, accept) {
  const { error } = await supabase.from('arcade_challenges').update({ status: accept ? 'accepted' : 'declined' }).eq('id', ch.id);
  if (error) throw error;
  const handle = myUsername ? `@${myUsername}` : 'Your friend';
  await sendPushToUser(
    ch.challenger_id,
    accept ? 'Challenge accepted' : 'Challenge declined',
    accept ? `${handle} accepted your Arcade challenge. Post your run.` : `${handle} passed on your Arcade challenge.`,
    'arcade_challenge',
    { challenge_id: ch.id, accepted: accept },
  );
}

// Called by the arcade summary after the run's arcade_scores row is inserted
// with challenge_id. The trigger validates ownership and settles the duel.
export async function submitArcadeChallengeScore(ch, me, myUsername, scoreId) {
  const patch = ch.challenger_id === me ? { challenger_score_id: scoreId } : { challenged_score_id: scoreId };
  const { data, error } = await supabase.from('arcade_challenges').update(patch).eq('id', ch.id).select('*').single();
  if (error) throw error;
  const opponentId = ch.challenger_id === me ? ch.challenged_id : ch.challenger_id;
  const handle = myUsername ? `@${myUsername}` : 'Your friend';
  if (data.status === 'complete') {
    const iWon = data.winner_id === me, tie = !data.winner_id;
    await sendPushToUser(opponentId, tie ? 'Arcade duel: tied' : iWon ? 'Arcade duel: you lost' : 'Arcade duel: you won',
      tie ? `Dead heat with ${handle}. Same points, same time.` : iWon ? `${handle} took it. Run it back.` : `You beat ${handle}. Rematch?`,
      'arcade_challenge', { challenge_id: ch.id, complete: true });
  } else {
    await sendPushToUser(opponentId, 'Their run is in', `${handle} posted their Arcade run. Your turn.`, 'arcade_challenge', { challenge_id: ch.id });
  }
  return data;
}

export default { createArcadeChallenge, fetchMyArcadeChallenges, respondToArcadeChallenge, submitArcadeChallengeScore };
