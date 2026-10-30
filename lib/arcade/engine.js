// ─── Clocked Arcade — game engine / state machine ────────────────────────────
// Owns one mutable game record (held in a ref by the screen) and advances it
// with tick(). Scoring is NOT reinvented here: every hole is settled with
// scoreHole()/computeTimePar() from lib/clockedSport exactly as the real
// ClockedRoundScreen does (transport 'Cart', 1 player, chosen difficulty).
//
// Phases: 'aim' | 'power' | 'flight' | 'drive' | 'walk' | 'putt' | 'verdict'
//         | 'transition' | 'done'
// ('putt' is the aim phase on the green — same gestures, putter physics.)
//
// Clock: timestamp-anchored. holeStartTs is set at the first swing of hole 1
// and then at every hole-out (the next hole's time par starts the instant the
// ball drops — the drive to the next tee eats that hole's clock). Elapsed is
// always derived from Date.now() - anchor, never from frame counting, so a
// backgrounded app can't pause time.

import {
  scoreHole, summarizeRound, computeTimePar,
  DEFAULT_SCORING_SCALE, DEFAULT_CLOCK_COEFFICIENTS, DEFAULT_PENALTY_PARAMS,
} from '../clockedSport';
import { computeFullRating } from '../clockedRating';
import { generateRound, makeRng, dist } from './course';
import {
  surfaceAt, clubFor, shot, stepBall, stepCart, stepWalk,
  dispersionForHesitation, SURFACE, makeCart, fireTurbo,
} from './physics';

export const TRANSPORT = 'Cart';
export const PLAYERS = 1;
export const VERDICT_HOLD_MS = 1900;
export const TRANSITION_MS = 1100;
const POWER_PERIOD = 1.25;            // seconds for a full 0→1→0 sweep
export const SWING_MS = 380;          // downswing: lock → impact (the avatar swings in this window)
export const PUTT_SWING_MS = 300;
export const FOLLOW_MS = 320;         // impact → full finish
const ARRIVE_RADIUS = 3.5;            // cart close enough to the ball to swing
const WALK_RANGE = 32;                // on-foot golfer walks to a ball this close

// Real-life time pars (e.g. 5:00 for an intermediate par 4) assume walking
// to the ball, reading putts, other people. In the arcade a clean hole takes
// 40–90 s, so we scale the SAME table down to keep the clock honest-feeling
// rather than inventing a different ruleset. One knob, tune here.
export const ARCADE_TIME_SCALE = 0.35;

export function timeParFor(hole, difficulty) {
  const real = computeTimePar(hole.length, hole.par, PLAYERS, TRANSPORT, difficulty, null, DEFAULT_CLOCK_COEFFICIENTS);
  return Math.max(45, Math.round(real * ARCADE_TIME_SCALE));
}

// ─── Create ──────────────────────────────────────────────────────────────────
export function createGame({ seed, difficulty = 'intermediate' }) {
  const holes = generateRound(seed);
  const hole = holes[0];
  const g = {
    seed, difficulty, holes, holeIdx: 0, hole,
    phase: 'aim',
    ball: { x: hole.tee.x, y: hole.tee.y },
    flight: null,
    cart: makeCart(hole.tee.x + 4, hole.tee.y - 3, Math.PI / 2),
    swungAt: 0, impactAt: 0, impactFired: false,
    golfer: null, walkTarget: null,
    strokes: 0,
    holeResults: [],
    aimAngle: Math.atan2(hole.pin.y - hole.tee.y, hole.pin.x - hole.tee.x),
    aimStartedAt: null,              // hole 1: hesitation starts on the first touch
    isPutt: false,
    club: clubFor(SURFACE.TEE, dist(hole.tee, hole.pin)),
    lie: SURFACE.TEE,
    power: { value: 0, dir: 1 },
    lockedPower: null,
    lastDispersion: 2,
    clock: { roundStartTs: null, holeStartTs: null },
    expiredFired: false,
    verdictUntil: 0, transitionUntil: 0,
    events: [],
    rng: makeRng((seed * 7919) >>> 0),
    summary: null,
  };
  g.timePar = timeParFor(hole, difficulty);
  return g;
}

// ─── Clock reads ─────────────────────────────────────────────────────────────
export function holeElapsed(g, now = Date.now()) {
  if (!g.clock.holeStartTs) return 0;
  return Math.max(0, (now - g.clock.holeStartTs) / 1000);
}
export function roundElapsed(g, now = Date.now()) {
  if (!g.clock.roundStartTs) return 0;
  return Math.max(0, (now - g.clock.roundStartTs) / 1000);
}
export function runningPoints(g) {
  return g.holeResults.reduce((s, h) => s + (h.holeScore ?? 0), 0);
}

// ─── Aim / power actions ─────────────────────────────────────────────────────
function beginAim(g, now) {
  g.lie = surfaceAt(g.hole, g.ball);
  g.isPutt = g.lie === SURFACE.GREEN;
  g.club = clubFor(g.lie, dist(g.ball, g.hole.pin));
  g.aimAngle = Math.atan2(g.hole.pin.y - g.ball.y, g.hole.pin.x - g.ball.x);
  g.aimStartedAt = g.clock.roundStartTs ? now : null;
  g.phase = g.isPutt ? 'putt' : 'aim';
}

export function setAim(g, angle, now = Date.now()) {
  if (g.phase !== 'aim' && g.phase !== 'putt') return;
  if (g.aimStartedAt == null) g.aimStartedAt = now;
  g.aimAngle = angle;
}

export function releaseAim(g, now = Date.now()) {
  if (g.phase !== 'aim' && g.phase !== 'putt') return;
  if (g.aimStartedAt == null) g.aimStartedAt = now;
  g.power = { value: 0, dir: 1 };
  g.phase = 'power';
}

export function cancelPower(g) {
  if (g.phase !== 'power') return;
  g.phase = g.isPutt ? 'putt' : 'aim';
}

export function lockPower(g, now = Date.now()) {
  if (g.phase !== 'power') return;
  const power = g.power.value;
  g.lockedPower = power;

  // Round clock starts on the very first swing and never stops again.
  if (!g.clock.roundStartTs) {
    g.clock.roundStartTs = now;
    g.clock.holeStartTs = now;
  }

  const hesitation = g.aimStartedAt ? (now - g.aimStartedAt) / 1000 : 0;
  const dispersionDeg = dispersionForHesitation(hesitation, g.isPutt);
  g.lastDispersion = dispersionDeg;

  g.strokes += 1;
  g.flight = shot({
    from: g.ball, power, angle: g.aimAngle, lie: g.lie, isPutt: g.isPutt,
    dispersionDeg, club: g.club, rng: g.rng,
  });
  // The ball waits on the tee while the avatar swings; physics starts at impact.
  g.swungAt = now;
  g.impactAt = now + (g.isPutt ? PUTT_SWING_MS : SWING_MS);
  g.impactFired = false;
  g.phase = 'flight';
  g.events.push({ type: 'swing', power, isPutt: g.isPutt, hesitation });
}

// Avatar swing pose for the renderers: −1 = top of the backswing, 0 = address /
// impact, +1 = full finish. Driven by the power meter before the lock (a longer
// backswing is more power), then by the clock through impact and finish.
export function swingPose(g, now = Date.now()) {
  switch (g.phase) {
    case 'power': return -g.power.value;
    case 'flight': {
      if (now < g.impactAt) {
        const total = g.impactAt - g.swungAt;
        const p = total > 0 ? (now - g.swungAt) / total : 1;
        const eased = p * p;                       // accelerates into the ball
        return -(g.lockedPower ?? 0.6) * (1 - eased);
      }
      const f = Math.min(1, (now - g.impactAt) / FOLLOW_MS);
      return g.isPutt ? 0.25 * f : (1 - (1 - f) * (1 - f));
    }
    default: return 0;
  }
}

// Turbo button → cart boost (drive phase only).
export function requestTurbo(g, now = Date.now()) {
  if (g.phase !== 'drive') return false;
  const ok = fireTurbo(g.cart, now);
  if (ok) g.events.push({ type: 'turbo' });
  return ok;
}

// Current dispersion (degrees) for the aim-cone UI.
export function currentDispersion(g, now = Date.now()) {
  const hes = g.aimStartedAt ? (now - g.aimStartedAt) / 1000 : 0;
  return dispersionForHesitation(hes, g.isPutt);
}

// ─── Hole settlement — the real rules ────────────────────────────────────────
function holeOut(g, now, pickedUp) {
  const elapsedSec = Math.floor(holeElapsed(g, now));
  const result = scoreHole(
    [{ name: 'You', grossStrokes: g.strokes }],
    elapsedSec,
    { par: g.hole.par, yardage: g.hole.length },
    {
      scoringScale: DEFAULT_SCORING_SCALE,
      clockCoefficients: DEFAULT_CLOCK_COEFFICIENTS,
      penaltyParams: DEFAULT_PENALTY_PARAMS,
      transport: TRANSPORT, playerCount: PLAYERS, difficulty: g.difficulty,
      officialTimePars: null, holeNumber: g.holeIdx + 1,
    }
  );
  const entry = {
    ...result,
    hole: g.holeIdx + 1,
    strokes: g.strokes,
    pickedUp,
    difficulty: g.difficulty,
    players: result.playerResults.map(p => ({ name: p.name, strokes: p.grossStrokes, points: p.points, label: p.label })),
  };
  g.holeResults.push(entry);

  const delta = result.timePar - elapsedSec;
  g.events.push({
    type: 'verdict', beat: delta >= 0, delta: Math.abs(delta),
    result: entry, pickedUp,
  });

  g.phase = 'verdict';
  g.verdictUntil = now + VERDICT_HOLD_MS;
  g.flight = null;
  // The next hole is already on the clock.
  g.clock.holeStartTs = now;
}

function nextHole(g, now) {
  g.holeIdx += 1;
  if (g.holeIdx >= g.holes.length) {
    finish(g);
    return;
  }
  const hole = g.holes[g.holeIdx];
  g.hole = hole;
  g.timePar = timeParFor(hole, g.difficulty);
  g.ball = { x: hole.tee.x, y: hole.tee.y };
  g.cart = makeCart(hole.cartStart.x, hole.cartStart.y, Math.PI / 2);
  g.golfer = null; g.walkTarget = null;
  g.strokes = 0;
  g.expiredFired = false;
  g.lie = SURFACE.TEE;
  g.isPutt = false;
  g.club = clubFor(SURFACE.TEE, dist(hole.tee, hole.pin));
  g.phase = 'transition';
  g.transitionUntil = now + TRANSITION_MS;
  g.events.push({ type: 'holeStart', index: g.holeIdx, par: hole.par, timePar: g.timePar });
}

function finish(g) {
  const summary = summarizeRound(g.holeResults);
  const holesUnderClock = g.holeResults.filter(h => h.elapsed <= h.timePar).length;
  const totalStrokes = g.holeResults.reduce((s, h) => s + h.strokes, 0);
  const totalPlayerPoints = g.holeResults.reduce((s, h) => s + (h.playerResults?.[0]?.points ?? 0), 0);
  const rating = computeFullRating({
    roundStats: [{ totalPlayerPoints, holesPlayed: g.holeResults.length, holesUnderTimePar: holesUnderClock, difficulty: g.difficulty }],
    handicapIndex: null,
  });
  g.summary = {
    ...summary,
    totalStrokes,
    totalPlayerPoints,
    holesUnderClock,
    totalSeconds: summary.totalElapsed,
    arcadeScore: rating.clockedScore,
    rating,
    seed: g.seed,
    difficulty: g.difficulty,
    holes: g.holeResults,
  };
  g.phase = 'done';
  g.events.push({ type: 'done', summary: g.summary });
}

// After the ball stops: pickup rule, then where the player has to go next.
function afterRest(g, now) {
  g.ball = { x: g.flight.x, y: g.flight.y };
  g.flight = null;

  // Real rule: double bogey is the cap — you pick up there.
  if (g.strokes >= g.hole.par + 2) {
    holeOut(g, now, true);
    return;
  }

  if (g.golfer) {
    // On foot already (around the green).
    if (dist(g.golfer, g.ball) <= WALK_RANGE) { g.walkTarget = 'ball'; g.phase = 'walk'; }
    else { g.walkTarget = 'cart'; g.phase = 'walk'; }
    return;
  }
  g.phase = 'drive';
}

function ballNeedsWalk(g) {
  return dist(g.ball, g.hole.green) <= g.hole.greenRadius + 2.5;
}

// ─── Tick ────────────────────────────────────────────────────────────────────
// dt in seconds (clamped by the caller), now = Date.now(), joystick {dx,dy}.
export function tick(g, dt, now, joystick) {
  // Clock expiry — fires once per hole, in any live phase.
  if (g.clock.holeStartTs && !g.expiredFired && g.phase !== 'verdict' && g.phase !== 'done') {
    if (holeElapsed(g, now) > g.timePar) {
      g.expiredFired = true;
      g.events.push({ type: 'expired', hole: g.holeIdx + 1 });
    }
  }

  switch (g.phase) {
    case 'power': {
      let v = g.power.value + g.power.dir * (dt / (POWER_PERIOD / 2));
      if (v >= 1) { v = 1; g.power.dir = -1; }
      if (v <= 0) { v = 0; g.power.dir = 1; }
      g.power.value = v;
      break;
    }

    case 'flight': {
      if (now < g.impactAt) break;                 // avatar still swinging
      if (!g.impactFired) { g.impactFired = true; g.events.push({ type: 'impact', isPutt: g.isPutt }); }
      const ev = stepBall(g.hole, g.flight, dt);
      if (ev === 'tree' || ev === 'edge' || ev === 'land') g.events.push({ type: ev });
      if (ev === 'water') {
        g.strokes += 1; // penalty stroke, drop at entry point
        g.events.push({ type: 'water' });
        afterRest(g, now);
      } else if (ev === 'holed') {
        g.events.push({ type: 'holed', strokes: g.strokes });
        holeOut(g, now, false);
      } else if (ev === 'rest') {
        afterRest(g, now);
      }
      break;
    }

    case 'drive': {
      const bump = stepCart(g.hole, g.cart, joystick ?? { dx: 0, dy: 0 }, dt, now);
      if (bump) g.events.push({ type: bump });
      if (ballNeedsWalk(g)) {
        if (dist(g.cart, g.ball) <= g.hole.greenRadius + 12) {
          g.golfer = { x: g.cart.x, y: g.cart.y };
          g.walkTarget = 'ball';
          g.phase = 'walk';
        }
      } else if (dist(g.cart, g.ball) <= ARRIVE_RADIUS) {
        beginAim(g, now);
      }
      break;
    }

    case 'walk': {
      const target = g.walkTarget === 'cart' ? g.cart : g.ball;
      const arrived = stepWalk(g.golfer, target, dt);
      if (arrived) {
        if (g.walkTarget === 'cart') { g.golfer = null; g.walkTarget = null; g.phase = 'drive'; }
        else beginAim(g, now);
      }
      break;
    }

    case 'verdict':
      if (now >= g.verdictUntil) nextHole(g, now);
      break;

    case 'transition':
      if (now >= g.transitionUntil) g.phase = 'drive';
      break;

    default:
      break;
  }
  return g;
}

// Drain queued events (the screen plays sounds/haptics off these).
export function drainEvents(g) {
  const ev = g.events;
  g.events = [];
  return ev;
}

// Hint copy for the control bar.
export function hintFor(g) {
  switch (g.phase) {
    case 'aim':   return 'DRAG FROM THE BALL TO AIM — RELEASE TO START THE METER';
    case 'putt':  return 'ON THE GREEN — DRAG TO AIM THE PUTT';
    case 'power': return 'TAP TO LOCK POWER';
    case 'flight': return g.isPutt ? 'ROLLING…' : 'IN THE AIR';
    case 'drive': return g.strokes === 0 ? 'DRIVE TO THE TEE — TURBO WHEN IT\'S CHARGED' : 'DRIVE TO YOUR BALL — DRIFT THE TURNS';
    case 'walk':  return g.walkTarget === 'cart' ? 'WALKING BACK TO THE CART' : 'WALKING TO THE BALL';
    case 'verdict': return '';
    case 'transition': return `HOLE ${g.holeIdx + 1} — PAR ${g.hole.par}`;
    default: return '';
  }
}

export default {
  createGame, tick, setAim, releaseAim, cancelPower, lockPower, requestTurbo, swingPose,
  holeElapsed, roundElapsed, runningPoints, drainEvents, currentDispersion, hintFor, timeParFor,
};
