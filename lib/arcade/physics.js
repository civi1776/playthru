// ─── Clocked Arcade — pure physics ───────────────────────────────────────────
// Top-down 2D golf in yard units. No React, no side effects; every function
// takes state in and hands state (or a mutated ball record + event) back.
// The engine drives these at requestAnimationFrame cadence with a dt in sec.

import { dist, distToPolyline, inEllipse, CUP_RADIUS } from './course';

// ─── Surfaces ────────────────────────────────────────────────────────────────
export const SURFACE = {
  TEE: 'tee', FAIRWAY: 'fairway', ROUGH: 'rough',
  BUNKER: 'bunker', WATER: 'water', GREEN: 'green', OOB: 'oob',
};

// Rolling deceleration (yd/s^2). Higher = ball stops sooner.
const ROLL_DECEL = {
  tee: 22, fairway: 22, rough: 55, bunker: 170, green: 11, water: 0, oob: 22,
};

// What a lie does to the NEXT shot's distance.
export const LIE_POWER_MULT = {
  tee: 1, fairway: 1, green: 1, rough: 0.75, bunker: 0.5, water: 1, oob: 1,
};

// Cart speed multipliers by surface (base speed in CART_SPEED).
export const CART_SPEED = 16;          // yd/s on fairway
export const WALK_SPEED = 2.6;         // yd/s golfer on foot
const CART_SURFACE_MULT = { tee: 1, fairway: 1, rough: 0.55, bunker: 0.35, green: 0, water: 0, oob: 0 };

export function surfaceAt(hole, p) {
  if (p.x < 0 || p.x > hole.width || p.y < 0 || p.y > hole.height) return SURFACE.OOB;
  if (dist(p, hole.green) <= hole.greenRadius) return SURFACE.GREEN;
  for (const w of hole.water) if (inEllipse(p, w)) return SURFACE.WATER;
  for (const b of hole.bunkers) if (inEllipse(p, b)) return SURFACE.BUNKER;
  if (dist(p, hole.tee) <= 6) return SURFACE.TEE;
  if (distToPolyline(p, hole.fairway) <= hole.fairwayHalfWidth) return SURFACE.FAIRWAY;
  return SURFACE.ROUGH;
}

// ─── Clubs ───────────────────────────────────────────────────────────────────
// Auto-selected from lie + distance so the power meter always has useful
// resolution. maxYards is what 100% power carries+rolls from a clean lie.
export const CLUBS = {
  driver: { name: 'DRIVER', maxYards: 265 },
  wood:   { name: '3-WOOD', maxYards: 225 },
  iron:   { name: 'IRON',   maxYards: 175 },
  wedge:  { name: 'WEDGE',  maxYards: 95 },
  putter: { name: 'PUTTER', maxYards: 30 },
};

export function clubFor(lie, distToPin) {
  if (lie === SURFACE.GREEN) return CLUBS.putter;
  if (lie === SURFACE.BUNKER) return distToPin > 110 ? CLUBS.iron : CLUBS.wedge;
  if (distToPin > 240) return lie === SURFACE.TEE ? CLUBS.driver : CLUBS.wood;
  if (distToPin > 150) return lie === SURFACE.TEE ? CLUBS.wood : CLUBS.iron;
  if (distToPin > 85) return CLUBS.iron;
  return CLUBS.wedge;
}

// ─── Hesitation → dispersion ─────────────────────────────────────────────────
// The athletic twist: the longer you stand over the ball, the wider the cone.
export function dispersionForHesitation(hesitationSec, isPutt) {
  if (isPutt) return Math.min(10, 1 + hesitationSec * 1.2);
  return Math.min(16, 2 + hesitationSec * 1.6);
}

// ─── Shot ────────────────────────────────────────────────────────────────────
// shot({ from, power 0..1, angle rad, lie, isPutt, dispersionDeg, rng })
// → ball record the engine steps with stepBall(). Angle: 0 = +x, PI/2 = +y
// (toward the green). The cone is triangular-distributed so the center is
// still the most likely outcome — hesitation widens the tails.
export function shot({ from, power, angle, lie, isPutt, dispersionDeg, club, rng }) {
  const r = rng ?? Math.random;
  const spread = ((r() + r()) - 1) * (dispersionDeg * Math.PI / 180);
  const a = angle + spread;
  const distJitter = 1 + ((r() + r()) - 1) * 0.04;

  const p = Math.max(0.05, Math.min(1, power));
  const total = p * club.maxYards * (isPutt ? 1 : (LIE_POWER_MULT[lie] ?? 1)) * distJitter;

  if (isPutt) {
    const v0 = Math.sqrt(2 * ROLL_DECEL.green * total);
    return {
      x: from.x, y: from.y,
      vx: Math.cos(a) * v0, vy: Math.sin(a) * v0,
      airborne: false, airLeft: 0, airTotal: 0, landSpeed: 0,
      lastSafe: { x: from.x, y: from.y },
      moving: true, holed: false, isPutt: true, total,
    };
  }

  const carry = total * 0.86;
  const roll = total - carry;
  const airTime = 0.8 + carry / 160;
  const airSpeed = carry / airTime;
  const landSpeed = Math.sqrt(2 * ROLL_DECEL.fairway * roll);

  return {
    x: from.x, y: from.y,
    vx: Math.cos(a) * airSpeed, vy: Math.sin(a) * airSpeed,
    airborne: true, airLeft: airTime, airTotal: airTime, landSpeed,
    lastSafe: { x: from.x, y: from.y },
    moving: true, holed: false, isPutt: false, total,
  };
}

// Visual height 0..1 for the renderer (parabola over the carry).
export function ballHeight(ball) {
  if (!ball?.airborne || !ball.airTotal) return 0;
  const t = 1 - ball.airLeft / ball.airTotal;
  return Math.max(0, 4 * t * (1 - t));
}

function reflect(ball, nx, ny, restitution) {
  const dot = ball.vx * nx + ball.vy * ny;
  ball.vx = (ball.vx - 2 * dot * nx) * restitution;
  ball.vy = (ball.vy - 2 * dot * ny) * restitution;
}

// ─── stepBall(hole, ball, dt) → event | null ─────────────────────────────────
// Mutates `ball`. Events: 'tree' | 'edge' | 'land' | 'water' | 'holed' | 'rest'.
// Water: ball is moved back to lastSafe (entry point) — caller adds the stroke.
export function stepBall(hole, ball, dt) {
  if (!ball.moving) return null;
  let event = null;

  // Integrate in small sub-steps so fast balls don't tunnel through the cup.
  const steps = Math.max(1, Math.ceil((Math.hypot(ball.vx, ball.vy) * dt) / 0.5));
  const h = dt / steps;

  for (let i = 0; i < steps; i++) {
    ball.x += ball.vx * h;
    ball.y += ball.vy * h;

    // Edges — bounce.
    if (ball.x < 0.5)             { ball.x = 0.5;             reflect(ball,  1, 0, 0.55); event = event ?? 'edge'; }
    if (ball.x > hole.width - 0.5){ ball.x = hole.width - 0.5; reflect(ball, -1, 0, 0.55); event = event ?? 'edge'; }
    if (ball.y < 0.5)             { ball.y = 0.5;             reflect(ball,  0, 1, 0.55); event = event ?? 'edge'; }
    if (ball.y > hole.height - 0.5){ ball.y = hole.height - 0.5; reflect(ball, 0, -1, 0.55); event = event ?? 'edge'; }

    // Trees — deflect. Airborne balls only clip them in the lower part of the
    // arc (take-off and descent), high balls sail over.
    const hgt = ballHeight(ball);
    if (!ball.airborne || hgt < 0.45) {
      for (const t of hole.trees) {
        const d = dist(ball, t);
        if (d < t.r + 0.4) {
          const nx = (ball.x - t.x) / (d || 1), ny = (ball.y - t.y) / (d || 1);
          ball.x = t.x + nx * (t.r + 0.5);
          ball.y = t.y + ny * (t.r + 0.5);
          reflect(ball, nx, ny, 0.4);
          if (ball.airborne) {
            ball.airborne = false; ball.airLeft = 0;
            const sp = Math.hypot(ball.vx, ball.vy) || 1;
            const land = Math.min(sp, ball.landSpeed * 0.6);
            ball.vx = ball.vx / sp * land; ball.vy = ball.vy / sp * land;
          }
          event = 'tree';
          break;
        }
      }
    }

    if (ball.airborne) {
      ball.airLeft -= h;
      if (ball.airLeft <= 0) {
        ball.airborne = false;
        ball.airLeft = 0;
        const sp = Math.hypot(ball.vx, ball.vy) || 1;
        ball.vx = ball.vx / sp * ball.landSpeed;
        ball.vy = ball.vy / sp * ball.landSpeed;
        event = event ?? 'land';
      }
      continue;
    }

    // Rolling.
    const surf = surfaceAt(hole, ball);
    if (surf === SURFACE.WATER) {
      ball.x = ball.lastSafe.x; ball.y = ball.lastSafe.y;
      ball.vx = 0; ball.vy = 0; ball.moving = false;
      return 'water';
    }
    ball.lastSafe.x = ball.x; ball.lastSafe.y = ball.y;

    const speed = Math.hypot(ball.vx, ball.vy);
    // Cup capture: close + slow enough not to lip out.
    if (dist(ball, hole.pin) < CUP_RADIUS && speed < 9) {
      ball.x = hole.pin.x; ball.y = hole.pin.y;
      ball.vx = 0; ball.vy = 0; ball.moving = false; ball.holed = true;
      return 'holed';
    }
    // Rolling over the cup fast — the ball jumps slightly. Just nudge speed.
    if (dist(ball, hole.pin) < CUP_RADIUS && speed >= 9) {
      ball.vx *= 0.9; ball.vy *= 0.9;
    }

    const decel = ROLL_DECEL[surf] ?? 22;
    const newSpeed = Math.max(0, speed - decel * h);
    if (newSpeed <= 0.35) {
      ball.vx = 0; ball.vy = 0; ball.moving = false;
      return 'rest';
    }
    ball.vx = ball.vx / speed * newSpeed;
    ball.vy = ball.vy / speed * newSpeed;
  }
  return event;
}

// ─── Cart ────────────────────────────────────────────────────────────────────
// stepCart(hole, cart, input {dx,dy} (unit-ish), dt) → mutates cart {x,y,heading}
// The green is an invisible wall; so are water, trees and the strip edges.
function cartBlocked(hole, p) {
  if (p.x < 1.5 || p.x > hole.width - 1.5 || p.y < 1.5 || p.y > hole.height - 1.5) return true;
  if (dist(p, hole.green) <= hole.greenRadius + 1.5) return true;
  for (const w of hole.water) if (inEllipse(p, { ...w, rx: w.rx + 1, ry: w.ry + 1 })) return true;
  for (const t of hole.trees) if (dist(p, t) < t.r + 1.2) return true;
  return false;
}

export function stepCart(hole, cart, input, dt) {
  const mag = Math.min(1, Math.hypot(input.dx, input.dy));
  if (mag < 0.08) return cart;
  const surf = surfaceAt(hole, cart);
  const mult = CART_SURFACE_MULT[surf] ?? 1;
  const speed = CART_SPEED * (mult || 0.5) * mag;
  const nx = input.dx / (mag || 1), ny = input.dy / (mag || 1);
  cart.heading = Math.atan2(ny, nx);

  // Slide along obstacles: try full move, then each axis independently.
  const tryX = { x: cart.x + nx * speed * dt, y: cart.y };
  const tryY = { x: cart.x, y: cart.y + ny * speed * dt };
  if (!cartBlocked(hole, tryX)) cart.x = tryX.x;
  if (!cartBlocked(hole, { x: cart.x, y: tryY.y })) cart.y = tryY.y;
  return cart;
}

// ─── Golfer walk (straight line at walking pace) ─────────────────────────────
// Returns true when arrived.
export function stepWalk(golfer, target, dt) {
  const d = dist(golfer, target);
  const step = WALK_SPEED * dt;
  if (d <= step) { golfer.x = target.x; golfer.y = target.y; return true; }
  golfer.x += (target.x - golfer.x) / d * step;
  golfer.y += (target.y - golfer.y) / d * step;
  return false;
}

export default { surfaceAt, clubFor, shot, stepBall, stepCart, stepWalk, ballHeight, dispersionForHesitation, SURFACE, CLUBS };
