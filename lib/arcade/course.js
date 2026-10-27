// ─── Clocked Arcade — procedural course generation ───────────────────────────
// Pure, seeded, no React. World units are YARDS. Every hole is a vertical
// strip: tee at the bottom (small y), green + pin at the top (large y).
// x runs 0..WORLD_W across the strip. Renderers flip y to put the tee at the
// bottom of the screen.

export const WORLD_W = 110;        // strip width in yards
export const TEE_MARGIN = 28;      // yards of rough below the tee
export const GREEN_MARGIN = 36;    // yards of rough above the pin
export const FAIRWAY_HALF_WIDTH = 15;
export const CUP_RADIUS = 0.9;     // capture radius (yards, generous for an arcade)

// Par mix for the 9 — fixed so a "course" always totals par 36.
export const PAR_SEQUENCE = [4, 3, 5, 4, 4, 3, 4, 5, 4];

// ─── Seeded RNG (mulberry32) ─────────────────────────────────────────────────
export function makeRng(seed) {
  let a = (seed >>> 0) || 0x9e3779b9;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  next.range = (lo, hi) => lo + (hi - lo) * next();
  next.int = (lo, hi) => Math.floor(next.range(lo, hi + 1));
  next.pick = (arr) => arr[Math.floor(next() * arr.length)];
  next.chance = (p) => next() < p;
  return next;
}

export function randomSeed() {
  return Math.floor(Math.random() * 0x7fffffff);
}

// ─── Geometry helpers (shared with physics.js) ───────────────────────────────
export function dist(a, b) {
  const dx = a.x - b.x, dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
}

// Distance from point p to the polyline given by pts (array of {x,y}).
export function distToPolyline(p, pts) {
  let best = Infinity;
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1];
    const abx = b.x - a.x, aby = b.y - a.y;
    const len2 = abx * abx + aby * aby || 1e-9;
    let t = ((p.x - a.x) * abx + (p.y - a.y) * aby) / len2;
    t = Math.max(0, Math.min(1, t));
    const cx = a.x + abx * t, cy = a.y + aby * t;
    const d = Math.hypot(p.x - cx, p.y - cy);
    if (d < best) best = d;
  }
  return best;
}

export function inEllipse(p, e) {
  const dx = (p.x - e.x) / e.rx, dy = (p.y - e.y) / e.ry;
  return dx * dx + dy * dy <= 1;
}

// ─── Hole generation ─────────────────────────────────────────────────────────
// generateHole(index, seed) → {
//   index, par, length, width, height,
//   tee {x,y}, pin {x,y}, green {x,y}, greenRadius,
//   fairway: [{x,y}...] centerline polyline (stroke at 2*FAIRWAY_HALF_WIDTH),
//   fairwayHalfWidth, bunkers: [{x,y,rx,ry}], water: [{x,y,rx,ry}],
//   trees: [{x,y,r}], cartStart {x,y}
// }
export function generateHole(index, seed) {
  const rng = makeRng((seed ^ (index + 1) * 0x45d9f3b) >>> 0);
  const par = PAR_SEQUENCE[index % PAR_SEQUENCE.length];

  const length =
    par === 3 ? rng.int(135, 190) :
    par === 4 ? rng.int(330, 420) :
                rng.int(480, 560);

  const width = WORLD_W;
  const height = TEE_MARGIN + length + GREEN_MARGIN;

  const tee = { x: width / 2 + rng.range(-10, 10), y: TEE_MARGIN };
  const greenRadius = par === 3 ? rng.range(10, 12) : rng.range(11, 14);
  const green = { x: width / 2 + rng.range(-22, 22), y: TEE_MARGIN + length };
  // Pin sits inside the green, never on the fringe.
  const pinAng = rng.range(0, Math.PI * 2);
  const pinR = rng.range(0, greenRadius * 0.55);
  const pin = { x: green.x + Math.cos(pinAng) * pinR, y: green.y + Math.sin(pinAng) * pinR };

  // Fairway centerline: tee → (optional dogleg points) → green.
  const fairway = [tee];
  const bends = par === 3 ? 0 : par === 4 ? rng.int(1, 2) : rng.int(2, 3);
  for (let b = 1; b <= bends; b++) {
    const t = b / (bends + 1);
    const y = tee.y + length * t;
    const drift = rng.range(-26, 26);
    const x = Math.max(FAIRWAY_HALF_WIDTH + 4, Math.min(width - FAIRWAY_HALF_WIDTH - 4, width / 2 + drift));
    fairway.push({ x, y });
  }
  fairway.push({ x: green.x, y: green.y });

  // Bunkers — 1 to 3, greenside first then along the fairway.
  const bunkers = [];
  const nBunkers = rng.int(1, 3);
  for (let i = 0; i < nBunkers; i++) {
    if (i === 0) {
      const ang = rng.range(Math.PI * 0.9, Math.PI * 2.1); // mostly short/sides of green
      const d = greenRadius + rng.range(4, 7);
      bunkers.push({
        x: green.x + Math.cos(ang) * d,
        y: green.y + Math.sin(ang) * d,
        rx: rng.range(4, 6.5), ry: rng.range(3, 5),
      });
    } else {
      const t = rng.range(0.35, 0.8);
      const idx = Math.min(fairway.length - 2, Math.floor(t * (fairway.length - 1)));
      const a = fairway[idx], b = fairway[idx + 1];
      const lt = (t * (fairway.length - 1)) - idx;
      const cx = a.x + (b.x - a.x) * lt, cy = a.y + (b.y - a.y) * lt;
      const side = rng.chance(0.5) ? 1 : -1;
      bunkers.push({
        x: cx + side * (FAIRWAY_HALF_WIDTH + rng.range(2, 6)),
        y: cy,
        rx: rng.range(4, 7), ry: rng.range(5, 9),
      });
    }
  }

  // Water — optional, off one side of the fairway or guarding the green.
  const water = [];
  if (par !== 3 ? rng.chance(0.55) : rng.chance(0.4)) {
    if (rng.chance(0.4)) {
      // guarding the green, short-side
      const side = rng.chance(0.5) ? 1 : -1;
      water.push({
        x: green.x + side * (greenRadius + 14),
        y: green.y - rng.range(2, 10),
        rx: rng.range(10, 14), ry: rng.range(12, 20),
      });
    } else {
      const t = rng.range(0.3, 0.7);
      const idx = Math.min(fairway.length - 2, Math.floor(t * (fairway.length - 1)));
      const a = fairway[idx], b = fairway[idx + 1];
      const lt = (t * (fairway.length - 1)) - idx;
      const cx = a.x + (b.x - a.x) * lt, cy = a.y + (b.y - a.y) * lt;
      const side = rng.chance(0.5) ? 1 : -1;
      water.push({
        x: cx + side * (FAIRWAY_HALF_WIDTH + rng.range(13, 18)),
        y: cy,
        rx: rng.range(11, 16), ry: rng.range(18, 34),
      });
    }
  }

  // Trees — scattered in the rough, kept off the fairway/green/water/bunkers.
  const trees = [];
  const nTrees = par === 3 ? rng.int(4, 7) : rng.int(7, 13);
  let guard = 0;
  while (trees.length < nTrees && guard++ < 200) {
    const p = { x: rng.range(4, width - 4), y: rng.range(TEE_MARGIN - 12, height - 10) };
    const r = rng.range(2.5, 4.5);
    if (distToPolyline(p, fairway) < FAIRWAY_HALF_WIDTH + r + 2) continue;
    if (dist(p, green) < greenRadius + r + 6) continue;
    if (dist(p, tee) < 10) continue;
    if (water.some(w => inEllipse(p, { ...w, rx: w.rx + r, ry: w.ry + r }))) continue;
    if (bunkers.some(b => inEllipse(p, { ...b, rx: b.rx + r, ry: b.ry + r }))) continue;
    if (trees.some(t => dist(p, t) < t.r + r + 2)) continue;
    trees.push({ x: p.x, y: p.y, r });
  }

  // Where the cart arrives from the previous green (bottom corner, opposite
  // side from the tee so there's a real drive to the box).
  const cartStart = { x: tee.x < width / 2 ? width - 10 : 10, y: 6 };

  return {
    index, par, length, width, height,
    tee, pin, green, greenRadius,
    fairway, fairwayHalfWidth: FAIRWAY_HALF_WIDTH,
    bunkers, water, trees, cartStart,
  };
}

export function generateRound(seed) {
  return PAR_SEQUENCE.map((_, i) => generateHole(i, seed));
}

export default { generateHole, generateRound, makeRng, randomSeed, PAR_SEQUENCE, WORLD_W };
