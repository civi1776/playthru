/*
 * SQL — run in Supabase to support game persistence:
 *
 * alter table rounds add column if not exists active_game jsonb;
 */

// ─── Game metadata ─────────────────────────────────────────────────────────────
export const GAME_TYPES = [
  {
    id: 'Skins',
    icon: 'layers-outline',
    minPlayers: 2, maxPlayers: 8,
    desc: 'Win each hole outright. Ties carry the skin to the next hole.',
    howTo: 'Each hole is worth one skin. If two or more players tie for the low score, no skin is awarded — it carries over and the next hole is worth two skins. Player with the most skins at the end wins.',
  },
  {
    id: 'Nassau',
    icon: 'golf-outline',
    minPlayers: 2, maxPlayers: 8,
    desc: 'Three separate bets: front 9, back 9, and total 18.',
    howTo: 'Three simultaneous bets. Lowest net score wins the front 9, back 9, and total round. A press doubles the bet on the remaining holes of any segment you\'re losing.',
  },
  {
    id: 'Match Play',
    icon: 'shield-outline',
    minPlayers: 2, maxPlayers: 2,
    desc: 'Head-to-head. Win holes, not strokes. First to be up by more holes than remain wins.',
    howTo: '2-player only. Each hole is won by the player with the lower net score. The match is over when one player is up by more holes than remain. Handicap strokes are distributed across the first N holes.',
  },
  {
    id: 'Stableford',
    icon: 'star-outline',
    minPlayers: 2, maxPlayers: 8,
    desc: 'Points per hole relative to par. Most points wins.',
    howTo: 'Points per hole: Eagle+ = 4, Birdie = 3, Par = 2, Bogey = 1, Double+ = 0. Handicap strokes reduce your net score before counting. Most total points wins.',
  },
  {
    id: 'Wolf',
    icon: 'paw-outline',
    minPlayers: 4, maxPlayers: 5,
    desc: 'Rotating wolf partners up each hole — or goes Lone Wolf for double stakes.',
    howTo: '4 or 5 players. Rotation determines who is wolf on each hole. Wolf auto-partners with the player who scored best that hole. With 5 players, the wolf picks 1 partner (wolf team = 2 vs 3). If the wolf\'s team wins, each wins 1 point from each opponent. Lone Wolf (5-player) earns 2 points from each opponent if they win.',
  },
  {
    id: '9 Point',
    icon: 'stats-chart-outline',
    minPlayers: 3, maxPlayers: 3,
    desc: '9 points distributed per hole: 5 for 1st, 3 for 2nd, 1 for 3rd.',
    howTo: 'Exactly 3 players. Each hole distributes 9 points: winner gets 5, 2nd gets 3, 3rd gets 1. Ties split the available points equally. Most points at the end wins.',
  },
];

// ─── Skins ────────────────────────────────────────────────────────────────────
export function calcSkins(playerScores, pars) {
  const n = playerScores.length;
  const skins = Array(n).fill(0);
  let carryOver = 0;

  for (let h = 0; h < pars.length; h++) {
    const hs = playerScores.map(ps => ps?.[h]);
    if (hs.some(s => s == null)) continue;

    const min = Math.min(...hs);
    const ws = hs.reduce((acc, s, i) => (s === min ? [...acc, i] : acc), []);

    if (ws.length === 1) {
      skins[ws[0]] += 1 + carryOver;
      carryOver = 0;
    } else {
      carryOver++;
    }
  }
  return { skins, carryOver };
}

// ─── Nassau ───────────────────────────────────────────────────────────────────
export function calcNassau(playerScores, pars, players, useHandicap) {
  const winner = (from, to) => {
    const nets = playerScores.map((ps, i) => {
      const gross = ps.slice(from, to).reduce((s, v) => s + (v ?? 0), 0);
      if (!useHandicap) return gross;
      const hcp = players[i]?.handicap ?? 0;
      const holes = to - from;
      return gross - (holes === 9 ? Math.round(hcp / 2) : hcp);
    });
    const min = Math.min(...nets);
    const ws = nets.reduce((acc, v, i) => (v === min ? [...acc, i] : acc), []);
    return ws.length === 1 ? ws[0] : null; // null = tie
  };

  const total = pars.length;
  return {
    front: total >= 9  ? winner(0, Math.min(9, total))  : null,
    back:  total >= 18 ? winner(9, 18)                   : null,
    total: winner(0, total),
  };
}

// ─── Match Play ───────────────────────────────────────────────────────────────
export function calcMatchPlay(playerScores, pars, players, useHandicap) {
  if (!playerScores[0] || !playerScores[1]) {
    return { status: 0, holeResults: [], matchOver: false, statusStr: 'All Square' };
  }

  const hcp0 = players[0]?.handicap ?? 0;
  const hcp1 = players[1]?.handicap ?? 0;
  const diff = Math.abs(hcp0 - hcp1);
  const strokeReceiver = hcp0 > hcp1 ? 0 : 1; // higher handicap gets strokes

  let status = 0; // positive = player 0 leads
  const holeResults = [];
  let matchOver = false;
  let statusStr = 'All Square';

  for (let h = 0; h < pars.length; h++) {
    if (matchOver) { holeResults.push(null); continue; }

    const s0 = playerScores[0][h];
    const s1 = playerScores[1][h];
    if (s0 == null || s1 == null) { holeResults.push(null); continue; }

    let a0 = s0, a1 = s1;
    if (useHandicap && diff > 0 && h < diff) {
      if (strokeReceiver === 0) a0 -= 1;
      else a1 -= 1;
    }

    if (a0 < a1)      { status++; holeResults.push(0); }
    else if (a1 < a0) { status--; holeResults.push(1); }
    else              { holeResults.push(-1); } // halved

    const holesLeft = pars.length - h - 1;
    if (Math.abs(status) > holesLeft) {
      matchOver = true;
      const lead = Math.abs(status);
      const leadName = status > 0 ? (players[0]?.name ?? 'P1') : (players[1]?.name ?? 'P2');
      statusStr = `${leadName} wins ${lead}&${holesLeft}`;
    }
  }

  if (!matchOver) {
    if (status === 0) {
      statusStr = 'All Square';
    } else {
      const lead = Math.abs(status);
      const leadName = status > 0 ? (players[0]?.name ?? 'P1') : (players[1]?.name ?? 'P2');
      statusStr = `${leadName} ${lead} UP`;
    }
  }

  return { status, holeResults, matchOver, statusStr };
}

// ─── Stableford ───────────────────────────────────────────────────────────────
export function calcStableford(playerScores, pars, players, useHandicap) {
  return playerScores.map((ps, i) => {
    const hcp = players[i]?.handicap ?? 0;
    const n = pars.length;
    const holePoints = pars.map((par, h) => {
      const score = ps?.[h];
      if (score == null) return null;
      const base = useHandicap ? Math.floor(hcp / n) + (h < hcp % n ? 1 : 0) : 0;
      const diff = (score - base) - par;
      if (diff <= -2) return 4;
      if (diff === -1) return 3;
      if (diff === 0)  return 2;
      if (diff === 1)  return 1;
      return 0;
    });
    const total = holePoints.reduce((s, v) => s + (v ?? 0), 0);
    return { playerIdx: i, total, holePoints };
  });
}

// ─── Wolf ─────────────────────────────────────────────────────────────────────
export function calcWolf(playerScores, pars, players) {
  const n = players.length; // 4 or 5
  const points = Array(n).fill(0);
  const holeResults = [];

  for (let h = 0; h < pars.length; h++) {
    const wolfIdx = h % n;
    const hs = playerScores.map(ps => ps?.[h]);
    if (hs.some(s => s == null)) { holeResults.push({ wolfIdx }); continue; }

    const others = Array.from({ length: n }, (_, i) => i).filter(i => i !== wolfIdx);

    // Auto-partner: player with lowest score among non-wolf
    const minOther = Math.min(...others.map(i => hs[i]));
    const partnerIdx = others.find(i => hs[i] === minOther);

    // Wolf team = 2 players (wolf + 1 partner); opponents = the rest (2 for 4P, 3 for 5P)
    const team1 = [wolfIdx, partnerIdx];
    const team2 = others.filter(i => i !== partnerIdx);
    const t1Min = Math.min(hs[wolfIdx], hs[partnerIdx]);
    const t2Min = Math.min(...team2.map(i => hs[i]));

    // Each winning team member earns 1 point from each opposing player
    if (t1Min < t2Min) {
      team1.forEach(i => { points[i] += team2.length; });
      team2.forEach(i => { points[i] -= team1.length; });
      holeResults.push({ wolfIdx, partnerIdx, winner: 'wolfTeam' });
    } else if (t2Min < t1Min) {
      team2.forEach(i => { points[i] += team1.length; });
      team1.forEach(i => { points[i] -= team2.length; });
      holeResults.push({ wolfIdx, partnerIdx, winner: 'otherTeam' });
    } else {
      holeResults.push({ wolfIdx, partnerIdx, winner: 'tie' });
    }
  }

  return { points, holeResults };
}

// ─── 9 Point ─────────────────────────────────────────────────────────────────
export function calcNinePoint(playerScores, pars, players) {
  const DIST = [5, 3, 1];
  const totals = Array(players.length).fill(0);
  const holeResults = [];

  for (let h = 0; h < pars.length; h++) {
    const hs = playerScores.map((ps, i) => ({ idx: i, score: ps?.[h] }));
    if (hs.some(s => s.score == null)) { holeResults.push(null); continue; }

    const sorted = [...hs].sort((a, b) => a.score - b.score);
    let pos = 0;
    while (pos < sorted.length) {
      const tieScore = sorted[pos].score;
      const group = sorted.filter(r => r.score === tieScore);
      const pts = DIST.slice(pos, pos + group.length).reduce((s, v) => s + v, 0) / group.length;
      group.forEach(r => { totals[r.idx] += pts; });
      pos += group.length;
    }
    holeResults.push({ sorted });
  }

  return { totals, holeResults };
}

// ─── Dispatcher ───────────────────────────────────────────────────────────────
export function calcGame(type, playerScores, pars, players, useHandicap) {
  switch (type) {
    case 'Skins':             return calcSkins(playerScores, pars);
    case 'Nassau':            return calcNassau(playerScores, pars, players, useHandicap);
    case 'Match Play':        return calcMatchPlay(playerScores, pars, players, useHandicap);
    case 'Stableford':        return calcStableford(playerScores, pars, players, useHandicap);
    case 'Wolf':              return calcWolf(playerScores, pars, players);
    case '9 Point':           return calcNinePoint(playerScores, pars, players);
    default:                  return null;
  }
}

// ─── Convert game result → unit scores per player ────────────────────────────
export function gameResultToUnitScores(type, result, n) {
  switch (type) {
    case 'Skins':
      return result.skins ?? Array(n).fill(0);
    case 'Nassau': {
      const s = Array(n).fill(0);
      if (result.front != null) s[result.front] += 1;
      if (result.back  != null) s[result.back]  += 1;
      if (result.total != null) s[result.total] += 1;
      return s;
    }
    case 'Match Play': {
      const s = Array(n).fill(0);
      if (result.status > 0) s[0] += Math.abs(result.status);
      else if (result.status < 0) s[1] += Math.abs(result.status);
      return s;
    }
    case 'Stableford':
      return (result ?? []).map(r => r.total ?? 0);
    case 'Wolf':
      return result.points ?? Array(n).fill(0);
    case '9 Point':
      return result.totals ?? Array(n).fill(0);
    default:
      return Array(n).fill(0);
  }
}

// ─── Settlement ───────────────────────────────────────────────────────────────
// unitScores: numeric score per player (higher = better).
// Returns array of { from, to, fromName, toName, amount } transactions.
export function calcSettlement(unitScores, dollarPerUnit, players) {
  const n = players.length;
  const avg = unitScores.reduce((s, v) => s + v, 0) / n;
  const balances = unitScores.map(s => (s - avg) * (dollarPerUnit ?? 1));

  const debtors   = balances.map((b, i) => ({ idx: i, bal: b })).filter(x => x.bal < -0.005);
  const creditors = balances.map((b, i) => ({ idx: i, bal: b })).filter(x => x.bal > 0.005);
  debtors.sort((a, b) => a.bal - b.bal);
  creditors.sort((a, b) => b.bal - a.bal);

  const txs = [];
  let di = 0, ci = 0;
  while (di < debtors.length && ci < creditors.length) {
    const d = debtors[di], c = creditors[ci];
    const amt = Math.min(-d.bal, c.bal);
    if (amt > 0.005) {
      txs.push({
        from:     d.idx,
        to:       c.idx,
        fromName: players[d.idx]?.name ?? `P${d.idx + 1}`,
        toName:   players[c.idx]?.name ?? `P${c.idx + 1}`,
        amount:   parseFloat(amt.toFixed(2)),
      });
    }
    d.bal += amt;
    c.bal -= amt;
    if (Math.abs(d.bal) < 0.005) di++;
    if (Math.abs(c.bal) < 0.005) ci++;
  }
  return txs;
}
