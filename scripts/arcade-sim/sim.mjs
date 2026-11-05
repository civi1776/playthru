// Headless nine-hole arcade simulation with a "decent human" policy.
import { createGame, tick, setAim, releaseAim, lockPower, requestTurbo, drainEvents, tuningFor } from '../../lib/arcade/engine.js';
import { dist } from '../../lib/arcade/course.js';
import { LIE_POWER_MULT, turboState } from '../../lib/arcade/physics.js';

const DT = 1 / 60;
let seedRng = 12345;
const rnd = () => { seedRng = (seedRng * 1664525 + 1013904223) >>> 0; return seedRng / 4294967296; };
const gauss = (s) => { const u = rnd() || 1e-9, v = rnd(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v) * s; };
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

function playRound(seed, difficulty, opts = {}) {
  const g = createGame({ seed, difficulty });
  const tune = tuningFor(difficulty);
  const hesitation = opts.hesitation ?? 0.9;
  const lockSigma = (opts.lockSigma ?? Number(process.env.SIGMA ?? 0.05)) * (1.25 / tune.meterPeriod);
  let now = 1_000_000;
  const phaseTime = {};
  const holes = [];
  let cur = null;
  const events = {};
  let swings = [];
  let lockTarget = null, lockPending = false;
  let aimUntil = 0;
  let stuckGuard = 0, pinned = 0, detourUntil = 0, detourSign = 1;

  const startHole = () => { cur = { phase: {}, putts: 0, chips: 0, maxPuttMeter: 0, events: {} }; };
  startHole();

  for (let iter = 0; iter < 60 * 60 * 20; iter++) { // 20 min cap
    const before = g.phase;
    let joystick = null;

    if (g.phase === 'aim' || g.phase === 'putt') {
      if (!lockPending) {
        // first touch sets aim and starts the hesitation clock
        const a = Math.atan2(g.hole.pin.y - g.ball.y, g.hole.pin.x - g.ball.x);
        setAim(g, a, now);
        aimUntil = now + hesitation * 1000;
        lockPending = true;
      } else if (now >= aimUntil) {
        const d = dist(g.ball, g.hole.pin);
        const max = g.club.maxYards * (g.isPutt ? 1 : (LIE_POWER_MULT[g.lie] ?? 1));
        const want = clamp(d / max, 0.1, 1);
        lockTarget = clamp(want + gauss(lockSigma), 0.05, 1);
        if (g.isPutt) { cur.putts++; cur.maxPuttMeter = Math.max(cur.maxPuttMeter, g.club.maxYards); }
        if (g.club.key === 'chip') cur.chips++;
        releaseAim(g, now);
      }
    } else if (g.phase === 'power') {
      if ((g.power.dir === 1 && g.power.value >= lockTarget) || g.power.value >= 0.999) {
        swings.push({ hole: g.holeIdx + 1, club: g.club.key, putt: g.isPutt, disp: null, power: g.power.value, lie: g.lie });
        lockPower(g, now);
        swings[swings.length - 1].disp = g.lastDispersion;
        lockPending = false;
      }
    } else if (g.phase === 'drive') {
      const dx = g.ball.x - g.cart.x, dy = g.ball.y - g.cart.y;
      const d = Math.hypot(dx, dy);
      // Brake into the ball: full stick when far, ease off inside 24yd, coast
      // when still quick and close so momentum does not carry us past.
      let mag = clamp((d - 1.5) / 24, 0.18, 1);
      if (d < 10 && g.cart.speed > 7) mag = 0;
      // Pinned on a wall (green, water, edge): a human steers around it.
      // Wall-follow: after 0.5s stationary while pushing, swing 90 degrees
      // for 1.4s, then try the direct line again.
      pinned = (g.cart.speed < 1 && mag > 0.3) ? pinned + DT : 0;
      if (pinned > 0.5 && detourUntil < now) { detourUntil = now + 1400; detourSign = rnd() < 0.5 ? 1 : -1; }
      let ang = Math.atan2(dy, dx);
      if (detourUntil > now) { ang += detourSign * Math.PI / 2; mag = 1; }
      joystick = { dx: Math.cos(ang) * mag, dy: Math.sin(ang) * mag };
      if (d > 45 && turboState(g.cart, now).ready) requestTurbo(g, now);
      stuckGuard += DT;
      if (stuckGuard > 120) { return { summary: g.summary, holes, swings, ended: `stuck driving on hole ${g.holeIdx + 1}: cart (${g.cart.x.toFixed(0)},${g.cart.y.toFixed(0)}) ball (${g.ball.x.toFixed(0)},${g.ball.y.toFixed(0)}) hole ${g.hole.width}x${g.hole.height} green (${g.hole.green.x.toFixed(0)},${g.hole.green.y.toFixed(0)}) r${g.hole.greenRadius.toFixed(0)}, d ${d.toFixed(1)}, speed ${g.cart.speed.toFixed(1)}, lie ${g.lie}` }; }
    }

    tick(g, DT, now, joystick);
    now += DT * 1000;
    cur.phase[before] = (cur.phase[before] ?? 0) + DT;

    for (const ev of drainEvents(g)) {
      if (['water', 'edge', 'tree', 'flagstick', 'expired', 'turbo'].includes(ev.type)) cur.events[ev.type] = (cur.events[ev.type] ?? 0) + 1;
      if (ev.type === 'verdict') {
        const r = ev.result;
        holes.push({ hole: r.hole, par: g.hole.par, len: Math.round(g.hole.length), strokes: r.strokes, pts: r.playerResults[0].points, holeScore: r.holeScore, elapsed: r.elapsed, timePar: r.timePar, arcadePar: g.timePar, penalty: r.penalty, beat: ev.beat, pickedUp: ev.pickedUp, timedOut: !!ev.timedOut, bonus: ev.bonus ?? 0, ...cur });
        startHole(); stuckGuard = 0; pinned = 0; detourUntil = 0; lockPending = false;
      }
      if (ev.type === 'done') return { summary: g.summary, holes, swings };
    }
    if (g.phase === 'done') return { summary: g.summary, holes, swings };
  }
  return { summary: g.summary, holes, swings, ended: `20-minute cap in phase ${g.phase} on hole ${g.holeIdx + 1}` };
}

const args = process.argv.slice(2);
const seeds = Number(args[0] ?? 12);
const hes = Number(args[1] ?? 0.9);
const mean = a => a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0;

for (const difficulty of ['beginner', 'intermediate', 'pro']) {
  const rounds = [];
  for (let s = 1; s <= seeds; s++) rounds.push(playRound(1000 + s, difficulty, { hesitation: hes }));
  const ended = rounds.filter(r => r.ended); if (ended.length) console.log(`\n[${difficulty}] ${ended.length} rounds did not finish: ` + ended.slice(0,3).map(r => r.ended).join(' | '));
  const H = rounds.flatMap(r => r.holes);
  const S = rounds.flatMap(r => r.swings);
  const pts = rounds.map(r => r.summary?.totalScore ?? 0);   // board points: scoring + penalties + heat
  const secs = rounds.map(r => r.summary?.totalSeconds ?? 0);
  const phase = {};
  for (const h of H) for (const [k, v] of Object.entries(h.phase)) phase[k] = (phase[k] ?? 0) + v;
  const totalPhase = Object.values(phase).reduce((a, b) => a + b, 0);
  const ev = {};
  for (const h of H) for (const [k, v] of Object.entries(h.events)) ev[k] = (ev[k] ?? 0) + v;
  const putts = S.filter(x => x.putt), chips = S.filter(x => x.club === 'chip');
  console.log(`\n=== ${difficulty.toUpperCase()}  (${seeds} rounds, hesitation ${hes}s) ===`);
  console.log(`board points/9: mean ${mean(pts).toFixed(1)}  min ${Math.min(...pts)}  max ${Math.max(...pts)}   time/9: ${(mean(secs) / 60).toFixed(1)} min`);
  console.log(`holes under time par: ${(100 * H.filter(h => h.beat).length / H.length).toFixed(0)}%   picked up (double): ${(100 * H.filter(h => h.pickedUp).length / H.length).toFixed(0)}%   expired: ${ev.expired ?? 0}/${H.length}`);
  console.log(`timeouts ${H.filter(h => h.timedOut).length}/${H.length}   heat bonus/round ${(H.reduce((a, h) => a + h.bonus, 0) / seeds).toFixed(1)}`);
  console.log(`strokes/hole ${mean(H.map(h => h.strokes)).toFixed(2)}   putts/hole ${mean(H.map(h => h.putts)).toFixed(2)}   3-putt+ holes ${H.filter(h => h.putts >= 3).length}   chips/hole ${mean(H.map(h => h.chips)).toFixed(2)}`);
  console.log(`events/round: water ${(ev.water ?? 0) / seeds}  edge ${(ev.edge ?? 0) / seeds}  tree ${(ev.tree ?? 0) / seeds}  flagstick ${(ev.flagstick ?? 0) / seeds}  turbo ${(ev.turbo ?? 0) / seeds}${ev.stuck ? '  STUCK ' + ev.stuck : ''}`);
  console.log(`time split: ` + Object.entries(phase).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${(100 * v / totalPhase).toFixed(0)}%`).join('  '));
  console.log(`avg hole elapsed ${mean(H.map(h => h.elapsed)).toFixed(0)}s vs scorer time par ${mean(H.map(h => h.timePar)).toFixed(0)}s vs HUD time par ${mean(H.map(h => h.arcadePar)).toFixed(0)}s   over HUD par: ${(100 * H.filter(h => h.elapsed > h.arcadePar).length / H.length).toFixed(0)}% of holes   penalised: ${H.filter(h => h.penalty < 0).length}   by par: ` + [3, 4, 5].map(p => { const hh = H.filter(h => h.par === p); return hh.length ? `par${p} ${mean(hh.map(h => h.elapsed)).toFixed(0)}/${mean(hh.map(h => h.timePar)).toFixed(0)}s` : ''; }).join('  '));
  console.log(`putt meter max avg ${mean(H.filter(h => h.maxPuttMeter).map(h => h.maxPuttMeter)).toFixed(1)}yd   putt cone avg ${mean(putts.map(x => x.disp)).toFixed(1)}°   chip cone avg ${mean(chips.map(x => x.disp)).toFixed(1)}°   full cone avg ${mean(S.filter(x => !x.putt && x.club !== 'chip').map(x => x.disp)).toFixed(1)}°`);
  const dist9 = {}; for (const h of H) dist9[h.holeScore] = (dist9[h.holeScore] ?? 0) + 1;
  console.log(`hole score distribution: ` + Object.entries(dist9).sort((a, b) => Number(b[0]) - Number(a[0])).map(([k, v]) => `${k}:${v}`).join('  '));
}
