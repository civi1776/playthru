// ─── HoleMap — SVG renderer for a Clocked Arcade hole ────────────────────────
// World units are yards; world y grows toward the green. The SVG viewBox is
// expressed in "render" coordinates where y is flipped (tee at the bottom of
// the screen). The static course layer is memoized per hole; only the dynamic
// layer (ball, cart, golfer, aim) re-renders every frame.

import { memo, useMemo } from 'react';
import Svg, { G, Rect, Path, Circle, Ellipse, Line, Polygon } from 'react-native-svg';
import { COLOR } from '../../lib/theme';
import { ballHeight, LIE_POWER_MULT, turboState } from '../../lib/arcade/physics';
import { avatarColors } from '../../lib/arcade/avatar';
import { TopGolfer } from './Golfer';

// Midnight Fairway palette for the course itself.
export const MAP = {
  rough:      '#11291A',
  roughLine:  '#17351F',
  fairway:    '#2C6239',
  fairwayHi:  '#347345',
  green:      '#3F8C4C',
  fringe:     '#376F42',
  tee:        '#3A7F47',
  sand:       '#D8C58A',
  sandEdge:   '#B8A46C',
  water:      '#0E4A58',
  waterEdge:  '#1A6B7C',
  treeDark:   '#0B2211',
  tree:       '#1C4A26',
  treeLight:  '#265C31',
  cup:        '#06120A',
  flag:       COLOR.gold,
  pole:       COLOR.cream,
  ball:       '#FFFFFF',
  ballShadow: '#00000066',
  cart:       COLOR.gold,
  cartTop:    '#0D1A0F',
  golfer:     COLOR.cream,
  aim:        COLOR.cream,
  cone:       COLOR.gold,
};

// ─── Camera ──────────────────────────────────────────────────────────────────
// Camera = { cx, cy, h } in WORLD coords; h = visible world height in yards.
function clampCamera(cam, hole, aspect) {
  const h = Math.min(cam.h, hole.height + 16);
  const vw = h * aspect;
  let cy = cam.cy, cx = cam.cx;
  if (h >= hole.height) cy = hole.height / 2;
  else cy = Math.max(h / 2 - 4, Math.min(hole.height - h / 2 + 4, cy));
  if (vw >= hole.width) cx = hole.width / 2;
  else cx = Math.max(vw / 2, Math.min(hole.width - vw / 2, cx));
  return { cx, cy, h };
}

function frameTwo(a, b, aspect, minH, pad) {
  const dy = Math.abs(a.y - b.y), dx = Math.abs(a.x - b.x);
  const h = Math.max(minH, dy * 1.25 + pad, (dx + pad) / aspect);
  return { cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2, h };
}

export function cameraTargetFor(g, aspect, current) {
  const hole = g.hole;
  let t;
  switch (g.phase) {
    case 'aim':
    case 'power':
      t = frameTwo(g.ball, hole.pin, aspect, 110, 50);
      // Keep a little room ahead of the ball so the aim line reads.
      t.cy = (g.ball.y + hole.pin.y) / 2 + 4;
      break;
    case 'putt':
      t = { cx: hole.green.x, cy: hole.green.y, h: Math.max(44, hole.greenRadius * 4.2) };
      break;
    case 'flight': {
      const b = g.flight ?? g.ball;
      t = { cx: b.x, cy: b.y, h: Math.max(90, current?.h ?? 120) };
      if (g.flight?.isPutt) t.h = Math.max(44, hole.greenRadius * 4.2);
      break;
    }
    case 'drive': {
      // Look ahead of the cart in the direction of travel and pull back a
      // touch as speed builds so fast driving still reads.
      const spd = Math.hypot(g.cart.vx ?? 0, g.cart.vy ?? 0);
      const ahead = { x: g.cart.x + (g.cart.vx ?? 0) * 0.45, y: g.cart.y + (g.cart.vy ?? 0) * 0.45 };
      t = frameTwo(ahead, g.ball, aspect, 112 + spd * 1.4, 56);
      break;
    }
    case 'walk': {
      const target = g.walkTarget === 'cart' ? g.cart : g.ball;
      t = frameTwo(g.golfer ?? target, target, aspect, 60, 30);
      break;
    }
    case 'verdict':
      t = { cx: hole.green.x, cy: hole.green.y, h: 70 };
      break;
    case 'transition':
    default:
      t = { cx: hole.width / 2, cy: hole.height / 2, h: hole.height + 16 };
      break;
  }
  return clampCamera(t, hole, aspect);
}

export function lerpCamera(cam, target, k) {
  return {
    cx: cam.cx + (target.cx - cam.cx) * k,
    cy: cam.cy + (target.cy - cam.cy) * k,
    h:  cam.h  + (target.h  - cam.h)  * k,
  };
}

export function screenToWorld(cam, hole, px, py, widthPx, heightPx) {
  const aspect = widthPx / heightPx;
  const vw = cam.h * aspect;
  const x = cam.cx - vw / 2 + (px / widthPx) * vw;
  const renderY = (hole.height - cam.cy) - cam.h / 2 + (py / heightPx) * cam.h;
  return { x, y: hole.height - renderY };
}

// ─── Static course layer ─────────────────────────────────────────────────────
const CourseLayer = memo(function CourseLayer({ hole }) {
  const H = hole.height;
  const ry = (y) => H - y;
  const fairwayPath = hole.fairway.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(2)} ${ry(p.y).toFixed(2)}`).join(' ');

  // Subtle mowing stripes across the rough — texture, not decoration.
  const stripes = [];
  for (let y = 0; y < H; y += 24) {
    stripes.push(<Rect key={y} x={0} y={ry(y + 12)} width={hole.width} height={12} fill={MAP.roughLine} opacity={0.5} />);
  }

  return (
    <G>
      <Rect x={0} y={0} width={hole.width} height={H} fill={MAP.rough} />
      {stripes}
      {/* Fairway: wide stroked centerline, then a lighter inner stripe */}
      <Path d={fairwayPath} stroke={MAP.fairway} strokeWidth={hole.fairwayHalfWidth * 2} fill="none" strokeLinecap="round" strokeLinejoin="round" />
      <Path d={fairwayPath} stroke={MAP.fairwayHi} strokeWidth={hole.fairwayHalfWidth * 0.9} fill="none" strokeLinecap="round" strokeLinejoin="round" opacity={0.35} />
      {/* Water */}
      {hole.water.map((w, i) => (
        <G key={`w${i}`}>
          <Ellipse cx={w.x} cy={ry(w.y)} rx={w.rx + 0.8} ry={w.ry + 0.8} fill={MAP.waterEdge} opacity={0.7} />
          <Ellipse cx={w.x} cy={ry(w.y)} rx={w.rx} ry={w.ry} fill={MAP.water} />
        </G>
      ))}
      {/* Bunkers */}
      {hole.bunkers.map((b, i) => (
        <G key={`b${i}`}>
          <Ellipse cx={b.x} cy={ry(b.y)} rx={b.rx + 0.6} ry={b.ry + 0.6} fill={MAP.sandEdge} />
          <Ellipse cx={b.x} cy={ry(b.y)} rx={b.rx} ry={b.ry} fill={MAP.sand} />
        </G>
      ))}
      {/* Tee box */}
      <Rect x={hole.tee.x - 4} y={ry(hole.tee.y) - 2.5} width={8} height={5} rx={1} fill={MAP.tee} />
      {/* Green + fringe */}
      <Circle cx={hole.green.x} cy={ry(hole.green.y)} r={hole.greenRadius + 1.6} fill={MAP.fringe} />
      <Circle cx={hole.green.x} cy={ry(hole.green.y)} r={hole.greenRadius} fill={MAP.green} />
      {/* Trees */}
      {hole.trees.map((t, i) => (
        <G key={`t${i}`}>
          <Circle cx={t.x + 0.6} cy={ry(t.y) + 0.8} r={t.r} fill={MAP.treeDark} opacity={0.8} />
          <Circle cx={t.x} cy={ry(t.y)} r={t.r} fill={MAP.tree} />
          <Circle cx={t.x - t.r * 0.3} cy={ry(t.y) - t.r * 0.3} r={t.r * 0.45} fill={MAP.treeLight} opacity={0.8} />
        </G>
      ))}
      {/* Cup + pin */}
      <Circle cx={hole.pin.x} cy={ry(hole.pin.y)} r={1} fill={MAP.cup} />
      <Line x1={hole.pin.x} y1={ry(hole.pin.y)} x2={hole.pin.x} y2={ry(hole.pin.y) - 7} stroke={MAP.pole} strokeWidth={0.45} />
      <Polygon points={`${hole.pin.x},${ry(hole.pin.y) - 7} ${hole.pin.x + 4},${ry(hole.pin.y) - 5.6} ${hole.pin.x},${ry(hole.pin.y) - 4.2}`} fill={MAP.flag} />
    </G>
  );
});

// ─── Dynamic layer ───────────────────────────────────────────────────────────
function Tracks({ trail, ry, s }) {
  if (!trail || trail.length < 2) return null;
  const off = 1.5 * s;
  let l = '', r = '';
  trail.forEach((p, i) => {
    const px = -Math.sin(p.h) * off, py = Math.cos(p.h) * off;   // world-left offset
    const L = `${(p.x + px).toFixed(2)} ${ry(p.y + py).toFixed(2)}`;
    const R = `${(p.x - px).toFixed(2)} ${ry(p.y - py).toFixed(2)}`;
    l += (i === 0 ? 'M' : 'L') + L + ' ';
    r += (i === 0 ? 'M' : 'L') + R + ' ';
  });
  return (
    <G opacity={0.35}>
      <Path d={l} stroke="#06120A" strokeWidth={0.55 * s} fill="none" strokeLinecap="round" strokeLinejoin="round" />
      <Path d={r} stroke="#06120A" strokeWidth={0.55 * s} fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </G>
  );
}

function Cart({ cart, ry, s, driver, avatar, now }) {
  const deg = -(cart.heading * 180 / Math.PI) + 90; // world heading → render rotation (nose up = +y)
  const w = 4.8 * s, l = 6.8 * s;
  const turbo = turboState(cart, now).active;
  const c = avatarColors(avatar);
  const flicker = 0.75 + 0.25 * Math.sin(now / 40);
  return (
    <G transform={`translate(${cart.x}, ${ry(cart.y)}) rotate(${deg})`}>
      {/* turbo flames out the back */}
      {turbo && (
        <G opacity={flicker}>
          <Polygon points={`${-w * 0.28},${l / 2} ${w * 0.28},${l / 2} 0,${l / 2 + 4.2 * s}`} fill={COLOR.goldBright} />
          <Polygon points={`${-w * 0.14},${l / 2} ${w * 0.14},${l / 2} 0,${l / 2 + 2.6 * s}`} fill="#FFFFFF" opacity={0.8} />
        </G>
      )}
      {/* shadow */}
      <Rect x={-w / 2 + 0.5} y={-l / 2 + 0.7} width={w} height={l} rx={1.2} fill="#00000055" />
      {/* wheels */}
      {[[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([sx, sy], i) => (
        <Rect key={i} x={sx * (w / 2) - 0.55 * s} y={sy * (l / 2 - 1.4 * s) - 0.9 * s} width={1.1 * s} height={1.8 * s} rx={0.3 * s} fill="#111" />
      ))}
      {/* body */}
      <Rect x={-w / 2} y={-l / 2} width={w} height={l} rx={1.1 * s} fill={MAP.cart} />
      {/* rear bag well */}
      <Rect x={-w / 2 + 0.6 * s} y={l / 2 - 2.0 * s} width={w - 1.2 * s} height={1.4 * s} rx={0.4 * s} fill={MAP.cartTop} opacity={0.75} />
      {/* seat */}
      <Rect x={-w / 2 + 0.6 * s} y={-0.3 * s} width={w - 1.2 * s} height={2.0 * s} rx={0.5 * s} fill={MAP.cartTop} />
      {/* driver */}
      {driver && (
        <G>
          <Ellipse cx={-0.4 * s} cy={0.7 * s} rx={1.2 * s} ry={0.7 * s} fill={c.shirt} />
          <Circle cx={-0.4 * s} cy={0.6 * s} r={0.62 * s} fill={c.hatStyle === 'none' ? c.skin : c.hat} />
        </G>
      )}
      {/* roof — translucent so the driver shows */}
      <Rect x={-w / 2 + 0.3 * s} y={-l / 2 + 1.0 * s} width={w - 0.6 * s} height={l * 0.55} rx={0.8 * s} fill="#F5EDD8" opacity={0.22} />
      <Rect x={-w / 2 + 0.3 * s} y={-l / 2 + 1.0 * s} width={w - 0.6 * s} height={l * 0.55} rx={0.8 * s} fill="none" stroke="#F5EDD8" strokeWidth={0.18 * s} opacity={0.5} />
      {/* windshield + headlights */}
      <Line x1={-w / 2 + 0.6 * s} y1={-l / 2 + 1.1 * s} x2={w / 2 - 0.6 * s} y2={-l / 2 + 1.1 * s} stroke="#9FD9FF" strokeWidth={0.35 * s} opacity={0.8} />
      <Circle cx={-w / 2 + 0.9 * s} cy={-l / 2 + 0.3 * s} r={0.35 * s} fill="#FFF6C8" />
      <Circle cx={w / 2 - 0.9 * s} cy={-l / 2 + 0.3 * s} r={0.35 * s} fill="#FFF6C8" />
    </G>
  );
}

function AimGuide({ ball, angle, lengthYd, dispersionDeg, ry }) {
  const toRender = (len, a) => ({ x: ball.x + Math.cos(a) * len, y: ry(ball.y + Math.sin(a) * len) });
  const end = toRender(lengthYd, angle);
  const rad = dispersionDeg * Math.PI / 180;
  const l = toRender(lengthYd, angle + rad), r = toRender(lengthYd, angle - rad);
  return (
    <G>
      <Polygon points={`${ball.x},${ry(ball.y)} ${l.x},${l.y} ${end.x},${end.y} ${r.x},${r.y}`} fill={MAP.cone} opacity={0.14} />
      <Line x1={ball.x} y1={ry(ball.y)} x2={l.x} y2={l.y} stroke={MAP.cone} strokeWidth={0.3} opacity={0.5} />
      <Line x1={ball.x} y1={ry(ball.y)} x2={r.x} y2={r.y} stroke={MAP.cone} strokeWidth={0.3} opacity={0.5} />
      <Line x1={ball.x} y1={ry(ball.y)} x2={end.x} y2={end.y} stroke={MAP.aim} strokeWidth={0.5} strokeDasharray="2 1.6" opacity={0.9} />
      <Circle cx={end.x} cy={end.y} r={1.1} fill="none" stroke={MAP.aim} strokeWidth={0.4} />
    </G>
  );
}

export default function HoleMap({ game, camera, width, height, dispersionDeg, powerValue, avatar, swingPose = 0, now = Date.now() }) {
  const hole = game.hole;
  const H = hole.height;
  const ry = (y) => H - y;
  const aspect = width / height;
  const vw = camera.h * aspect;
  const viewBox = `${(camera.cx - vw / 2).toFixed(3)} ${(ry(camera.cy) - camera.h / 2).toFixed(3)} ${vw.toFixed(3)} ${camera.h.toFixed(3)}`;

  // Size markers relative to zoom so they stay legible when the whole hole fits.
  const s = Math.max(0.55, Math.min(1.6, camera.h / 130));
  const ballR = 0.9 * s;

  const showAim = game.phase === 'aim' || game.phase === 'putt' || game.phase === 'power';
  const aimLen = useMemo(() => {
    const max = game.club.maxYards * (game.isPutt ? 1 : (LIE_POWER_MULT[game.lie] ?? 1));
    return game.phase === 'power' ? Math.max(3, max * Math.max(0.05, powerValue ?? 0)) : max;
  }, [game.club, game.lie, game.isPutt, game.phase, powerValue]);

  const flight = game.flight;
  const bx = flight ? flight.x : game.ball.x;
  const by = flight ? flight.y : game.ball.y;
  const hgt = flight ? ballHeight(flight) : 0;

  return (
    <Svg width={width} height={height} viewBox={viewBox}>
      <CourseLayer hole={hole} />
      {showAim && (
        <AimGuide ball={game.ball} angle={game.aimAngle} lengthYd={aimLen} dispersionDeg={dispersionDeg ?? 2} ry={ry} />
      )}
      <Tracks trail={game.cart.trail} ry={ry} s={s} />
      <Cart cart={game.cart} ry={ry} s={s} driver={game.phase === 'drive' || game.phase === 'transition'} avatar={avatar} now={now} />
      {/* Golfer: at the ball while swinging, on foot around the green */}
      {(game.phase === 'aim' || game.phase === 'putt' || game.phase === 'power' || game.phase === 'flight') && (
        <TopGolfer ball={game.ball} aim={game.aimAngle} pose={swingPose} avatar={avatar} s={s} ry={ry} />
      )}
      {game.golfer && game.phase === 'walk' && (
        <TopGolfer
          ball={game.walkTarget === 'cart' ? game.cart : game.ball}
          pos={game.golfer}
          aim={Math.atan2((game.walkTarget === 'cart' ? game.cart.y : game.ball.y) - game.golfer.y, (game.walkTarget === 'cart' ? game.cart.x : game.ball.x) - game.golfer.x)}
          avatar={avatar} s={s} ry={ry} walking walkT={now / 1000}
        />
      )}
      {/* Ball: shadow stays on the ground, ball lifts & grows with height */}
      {game.phase !== 'verdict' && game.phase !== 'transition' && (
        <G>
          <Circle cx={bx + hgt * 2.5} cy={ry(by) + hgt * 2.5} r={ballR * (1 - hgt * 0.3)} fill={MAP.ballShadow} />
          <Circle cx={bx} cy={ry(by) - hgt * 6} r={ballR * (1 + hgt * 0.9)} fill={MAP.ball} stroke="#00000044" strokeWidth={0.15} />
        </G>
      )}
    </Svg>
  );
}
