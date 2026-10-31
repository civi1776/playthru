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
export function dispersionForHesitation(hesitationSec, isPutt, mult = 1) {
  const base = isPutt ? Math.min(10, 1 + hesitationSec * 1.2) : Math.min(16, 2 + hesitationSec * 1.6);
  return base * mult;
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
    if (dist(ball, hole.pin) < (hole.cupRadius ?? CUP_RADIUS) && speed < 9) {
      ball.x = hole.pin.x; ball.y = hole.pin.y;
      ball.vx = 0; ball.vy = 0; ball.moving = false; ball.holed = true;
      return 'holed';
    }
    // Rolling over the cup fast — the ball jumps slightly. Just nudge speed.
    if (dist(ball, hole.pin) < (hole.cupRadius ?? CUP_RADIUS) && speed >= 9) {
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
// A little arcade vehicle model instead of "point and slide": the stick
// steers the heading and sets the throttle, speed builds with acceleration,
// and the velocity follows the heading with surface-dependent grip, so the
// cart drifts wide through fast turns and slides in sand. Turbo is a short
// boost on a cooldown. The green is an invisible wall; so are water, trees
// and the strip edges — hitting one at speed is a 'bump'.
export const CART = {
  MAX: 17,            // yd/s on fairway (~35 mph)
  TURBO_MULT: 1.6,    // top speed multiplier while boosting
  ACCEL: 19,          // yd/s² on the throttle
  BRAKE: 30,          // yd/s² when the stick points behind us
  COAST: 9,           // yd/s² rolling resistance with no input
  TURN: 3.4,          // rad/s steering rate at a standstill
  TURBO_MS: 1700,
  TURBO_COOLDOWN_MS: 5000,
  TRAIL_MAX: 90,
};
const CART_GRIP = { tee: 7, fairway: 7, rough: 4.2, bunker: 2.2, green: 7, water: 7, oob: 7 };

export function makeCart(x, y, heading = Math.PI / 2) {
  return { x, y, heading, speed: 0, vx: 0, vy: 0, turboUntil: 0, turboReadyAt: 0, trail: [], trailAcc: 0, bumpCd: 0 };
}

function cartBlocked(hole, p) {
  if (p.x < 1.5 || p.x > hole.width - 1.5 || p.y < 1.5 || p.y > hole.height - 1.5) return true;
  if (dist(p, hole.green) <= hole.greenRadius + 1.5) return true;
  for (const w of hole.water) if (inEllipse(p, { ...w, rx: w.rx + 1, ry: w.ry + 1 })) return true;
  for (const t of hole.trees) if (dist(p, t) < t.r + 1.2) return true;
  return false;
}

const approach = (v, target, step) => (v < target ? Math.min(target, v + step) : Math.max(target, v - step));

// stepCart(hole, cart, input {dx,dy}, dt, now) → 'bump' | null. Mutates cart.
export function stepCart(hole, cart, input, dt, now = Date.now()) {
  const mag = Math.min(1, Math.hypot(input?.dx ?? 0, input?.dy ?? 0));
  const surf = surfaceAt(hole, cart);
  const mult = CART_SURFACE_MULT[surf] ?? 1;
  const turbo = now < cart.turboUntil;
  const max = CART.MAX * (mult || 0.5) * (turbo ? CART.TURBO_MULT : 1);

  if (mag > 0.08) {
    const want = Math.atan2(input.dy, input.dx);
    let d = want - cart.heading;
    while (d > Math.PI) d -= 2 * Math.PI;
    while (d < -Math.PI) d += 2 * Math.PI;
    const turnRate = CART.TURN * (0.55 + 0.45 * (1 - Math.min(1, cart.speed / CART.MAX)));
    cart.heading += Math.max(-turnRate * dt, Math.min(turnRate * dt, d));
    // Stick pointing behind us = brake, otherwise throttle by stick magnitude.
    const target = Math.abs(d) > 2.0 ? 0 : max * mag;
    cart.speed = approach(cart.speed, target, (target > cart.speed ? CART.ACCEL : CART.BRAKE) * dt);
  } else {
    cart.speed = approach(cart.speed, 0, CART.COAST * dt);
  }
  if (turbo && mag > 0.08) cart.speed = Math.min(max, cart.speed + CART.ACCEL * dt);
  if (cart.speed > max) cart.speed = approach(cart.speed, max, CART.BRAKE * dt);

  // Velocity chases the heading — slowly in sand and rough, so the cart slides.
  const grip = (CART_GRIP[surf] ?? 6) * (turbo ? 0.8 : 1);
  const tvx = Math.cos(cart.heading) * cart.speed, tvy = Math.sin(cart.heading) * cart.speed;
  const k = Math.min(1, grip * dt);
  cart.vx += (tvx - cart.vx) * k;
  cart.vy += (tvy - cart.vy) * k;

  let event = null;
  cart.bumpCd = Math.max(0, cart.bumpCd - dt);
  const nx = cart.x + cart.vx * dt, ny = cart.y + cart.vy * dt;
  if (!cartBlocked(hole, { x: nx, y: cart.y })) cart.x = nx;
  else {
    if (Math.abs(cart.vx) > 5 && cart.bumpCd <= 0) { event = 'bump'; cart.bumpCd = 0.5; }
    cart.vx *= -0.25; cart.speed *= 0.45;
  }
  if (!cartBlocked(hole, { x: cart.x, y: ny })) cart.y = ny;
  else {
    if (Math.abs(cart.vy) > 5 && cart.bumpCd <= 0) { event = 'bump'; cart.bumpCd = 0.5; }
    cart.vy *= -0.25; cart.speed *= 0.45;
  }

  // Tire tracks: a breadcrumb every ~1.2 yd while moving.
  cart.trailAcc += Math.hypot(cart.vx, cart.vy) * dt;
  if (cart.trailAcc > 1.2 && cart.speed > 1.5) {
    cart.trailAcc = 0;
    cart.trail.push({ x: cart.x, y: cart.y, h: cart.heading, surf });
    if (cart.trail.length > CART.TRAIL_MAX) cart.trail.shift();
  }
  return event;
}

export function fireTurbo(cart, now = Date.now()) {
  if (now < cart.turboReadyAt || now < cart.turboUntil) return false;
  cart.turboUntil = now + CART.TURBO_MS;
  cart.turboReadyAt = cart.turboUntil + CART.TURBO_COOLDOWN_MS;
  return true;
}

// { active, ready, charge 0..1 } for the turbo button.
export function turboState(cart, now = Date.now()) {
  const active = now < cart.turboUntil;
  const ready = !active && now >= cart.turboReadyAt;
  const charge = ready ? 1 : active ? 1 - (cart.turboUntil - now) / CART.TURBO_MS
    : 1 - Math.max(0, cart.turboReadyAt - now) / CART.TURBO_COOLDOWN_MS;
  return { active, ready, charge: Math.max(0, Math.min(1, charge)) };
}

export const cartSpeedYds = (cart) => Math.hypot(cart.vx ?? 0, cart.vy ?? 0);
export const cartMph = (cart) => Math.round(cartSpeedYds(cart) * 2.045);

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

export default { surfaceAt, clubFor, shot, stepBall, stepCart, stepWalk, ballHeight, dispersionForHesitation, SURFACE, CLUBS, CART, makeCart, fireTurbo, turboState, cartMph };
