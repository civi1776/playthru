import { shot, stepBall, SURFACE, clubFor } from '../../lib/arcade/physics.js';
import { dist } from '../../lib/arcade/course.js';
// A flat 30-yard green, pin at centre, tilt across the putt line (worst case).
function run(distYd, slopeMag, cupR) {
  const hole = { width: 110, height: 200, green: { x: 55, y: 100 }, greenRadius: 14, pin: { x: 55, y: 100 }, cupRadius: cupR,
    water: [], bunkers: [], trees: [], tee: { x: 55, y: 10 }, fairway: [{ x: 55, y: 10 }, { x: 55, y: 100 }], fairwayHalfWidth: 14,
    slope: { x: slopeMag, y: 0, mag: slopeMag, dir: 0 } };
  const from = { x: 55, y: 100 - distYd };
  const club = clubFor(SURFACE.GREEN, distYd);
  const ball = shot({ from, power: Math.min(1, (distYd * 1.04) / club.maxYards), angle: Math.PI / 2, lie: 'green', isPutt: true, dispersionDeg: 0, club, rng: () => 0.5 });
  let ev = null, guard = 0;
  while (ball.moving && guard++ < 2000) ev = stepBall(hole, ball, 1 / 120) ?? ev;
  return { holed: ball.holed, miss: dist(ball, hole.pin).toFixed(2), lateral: Math.abs(ball.x - 55).toFixed(2) };
}
const levels = { intermediate: { mult: 0.55, cup: 0.72 }, pro: { mult: 1.0, cup: 0.54 } };
for (const [name, { mult, cup }] of Object.entries(levels)) {
  console.log(`\n${name.toUpperCase()}  (cup radius ${cup} yd)`);
  for (const base of [1.4, 2.2, 3.0]) {
    const row = [3, 6, 10, 15].map(d => { const r = run(d, base * mult, cup); return `${d}yd: ${r.holed ? 'IN ' : 'miss'} break ${r.lateral}`; });
    console.log(`  tilt ${(base * mult).toFixed(2)}  ` + row.join('   '));
  }
}
