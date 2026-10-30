// ─── Golfer — the arcade avatar, side-on and top-down ────────────────────────
// Flat-vector figure built from a handful of SVG primitives so it renders at
// 60 fps inside the game loop. One number drives the whole swing:
//   pose −1 = top of the backswing · 0 = address / impact · +1 = finish
// swingAngles() turns that into arm + wrist-hinge angles; both views share it.

import { memo } from 'react';
import Svg, { G, Circle, Line, Path, Rect, Ellipse } from 'react-native-svg';
import { avatarColors } from '../../lib/arcade/avatar';

const DEG = Math.PI / 180;

// Arm angle (screen degrees, y down, 0 = toward the target) and wrist hinge.
export function swingAngles(pose, isPutt) {
  const a0 = 58, h0 = 18;
  if (isPutt) return { arm: a0 + pose * 26, hinge: h0 };
  if (pose <= 0) { const t = -pose; return { arm: a0 + t * 175, hinge: h0 + t * 70 }; }
  return { arm: a0 - pose * 165, hinge: h0 - pose * 75 };
}

// ─── Side view (the swing stage) ─────────────────────────────────────────────
// viewBox 0 0 160 120. Golfer faces right; the target is off the right edge.
export const SwingStage = memo(function SwingStage({ avatar, pose = 0, isPutt = false, club, width = 160, height = 120, showBall = true, idleT = 0 }) {
  const c = avatarColors(avatar);
  const { arm, hinge } = swingAngles(pose, isPutt);
  const waggle = pose === 0 && !isPutt ? Math.sin(idleT * 2.2) * 2.5 : 0;   // tiny idle waggle at address
  const armA = (arm + waggle) * DEG;
  const clubA = (arm + waggle + hinge) * DEG;
  const S = { x: 76 + pose * 4, y: 48 };                         // shoulder pivot
  const H = { x: S.x + Math.cos(armA) * 30, y: S.y + Math.sin(armA) * 30 };
  const clubLen = isPutt ? 26 : 32;
  const C = { x: H.x + Math.cos(clubA) * clubLen, y: H.y + Math.sin(clubA) * clubLen };
  const headX = 82 + pose * 2, headY = 34;
  const ballX = 100, ballY = 101;
  const flying = pose > 0.05;
  const bx = ballX + pose * 72, by = ballY - (isPutt ? 0 : pose * 60 * (1.3 - pose * 0.3));

  return (
    <Svg width={width} height={height} viewBox="0 0 160 120">
      {/* ground */}
      <Rect x={0} y={104} width={160} height={16} fill="#163A20" />
      <Rect x={0} y={103} width={160} height={2} fill="#2C6239" />
      {[8, 30, 52, 118, 140].map(x => <Path key={x} d={`M${x} 104 l2 -5 l2 5`} fill="#2C6239" />)}
      {/* shadow */}
      <Ellipse cx={70} cy={104} rx={22} ry={3} fill="#00000055" />
      {/* back leg + front leg */}
      <Line x1={66} y1={76} x2={58} y2={102} stroke={c.pants} strokeWidth={7} strokeLinecap="round" />
      <Line x1={74} y1={76} x2={84} y2={102} stroke={c.pants} strokeWidth={7} strokeLinecap="round" />
      <Ellipse cx={56} cy={103} rx={6} ry={2.6} fill="#1A1A1A" />
      <Ellipse cx={87} cy={103} rx={6} ry={2.6} fill="#1A1A1A" />
      {/* torso (shirt) */}
      <Line x1={69} y1={74} x2={S.x} y2={S.y} stroke={c.shirt} strokeWidth={15} strokeLinecap="round" />
      <Line x1={69} y1={74} x2={S.x} y2={S.y} stroke={c.shirtDark} strokeWidth={15} strokeLinecap="round" opacity={0.18} />
      {/* belt */}
      <Line x1={62} y1={75} x2={77} y2={75} stroke="#1A1A1A" strokeWidth={2.2} strokeLinecap="round" />
      {/* head */}
      <Circle cx={headX} cy={headY} r={9} fill={c.skin} />
      <Path d={`M${headX - 9} ${headY - 1} A9 9 0 0 1 ${headX + 9} ${headY - 1} L${headX + 6} ${headY - 1} A6 6 0 0 0 ${headX - 6} ${headY - 1} Z`} fill={c.hair} />
      <Hat x={headX} y={headY} c={c} />
      {/* arms (trail + lead) */}
      <Line x1={S.x - 3} y1={S.y + 3} x2={H.x} y2={H.y} stroke={c.shirt} strokeWidth={5} strokeLinecap="round" />
      <Line x1={S.x} y1={S.y} x2={H.x} y2={H.y} stroke={c.skin} strokeWidth={4.5} strokeLinecap="round" />
      {/* club */}
      <Line x1={H.x} y1={H.y} x2={C.x} y2={C.y} stroke="#D8D8D8" strokeWidth={1.8} strokeLinecap="round" />
      <G transform={`translate(${C.x}, ${C.y}) rotate(${(arm + hinge) - 90})`}>
        {isPutt
          ? <Rect x={-1.2} y={-1} width={2.4} height={7} rx={0.8} fill="#9A9A9A" />
          : <Path d="M-1.6 -1 L1.6 -1 L4.2 5 Q3 7 0.5 7 L-1.8 3 Z" fill="#B8B8B8" stroke="#6E6E6E" strokeWidth={0.5} />}
      </G>
      {/* hands */}
      <Circle cx={H.x} cy={H.y} r={3.4} fill={c.skin} />
      {/* ball (+ tee off the tee box) */}
      {showBall && !flying && (
        <G>
          {club === 'DRIVER' && <Rect x={ballX - 0.8} y={ballY + 1.5} width={1.6} height={3} fill="#F5EDD8" />}
          <Circle cx={ballX} cy={ballY - (club === 'DRIVER' ? 1.2 : 0)} r={2.4} fill="#FFFFFF" />
        </G>
      )}
      {showBall && flying && (
        <G opacity={Math.max(0, 1 - pose * 0.6)}>
          <Line x1={ballX + 2} y1={ballY - 1} x2={bx} y2={by} stroke="#FFFFFF" strokeWidth={1} opacity={0.35} strokeDasharray="2 3" />
          <Circle cx={bx} cy={by} r={2.4} fill="#FFFFFF" />
        </G>
      )}
    </Svg>
  );
});

function Hat({ x, y, c }) {
  switch (c.hatStyle) {
    case 'cap':
      return (
        <G>
          <Path d={`M${x - 9.5} ${y - 1} A9.5 9.5 0 0 1 ${x + 9.5} ${y - 1} Z`} fill={c.hat} />
          <Rect x={x + 3} y={y - 3} width={12} height={3} rx={1.2} fill={c.hat} />
          <Circle cx={x} cy={y - 10} r={1.2} fill={c.hat} />
        </G>
      );
    case 'visor':
      return (
        <G>
          <Rect x={x - 9} y={y - 5} width={18} height={3} rx={1.5} fill={c.hat} />
          <Rect x={x + 3} y={y - 5} width={12} height={3} rx={1.2} fill={c.hat} />
        </G>
      );
    case 'bucket':
      return <Path d={`M${x - 8} ${y - 4} L${x - 6} ${y - 11} L${x + 6} ${y - 11} L${x + 8} ${y - 4} L${x + 13} ${y - 1} L${x - 13} ${y - 1} Z`} fill={c.hat} />;
    default:
      return null;
  }
}

// ─── Top-down figure for the hole map ────────────────────────────────────────
// Drawn in RENDER coordinates (y already flipped by the caller via `ry`).
// `aim` is the world aim angle; the golfer stands to the left of the ball for
// a right-hander and the club sweeps around the shoulders with `pose`.
export function TopGolfer({ ball, aim, pose = 0, avatar, s = 1, ry, walking = false, walkT = 0, pos }) {
  const c = avatarColors(avatar);
  const perpL = { x: -Math.sin(aim), y: Math.cos(aim) };                 // world-left of the aim
  const standOff = 1.7 * s;
  const G0 = pos ?? { x: ball.x + perpL.x * standOff, y: ball.y + perpL.y * standOff };
  const gx = G0.x, gy = ry(G0.y);
  const faceDeg = -(aim * 180 / Math.PI);                                // world → render rotation
  const bob = walking ? 1 + Math.sin(walkT * 9) * 0.06 : 1;
  // Club: from shoulders toward the ball, swept by pose (world angles).
  const toBall = Math.atan2(ball.y - G0.y, ball.x - G0.x);
  const clubA = walking ? aim + Math.PI * 0.85 : toBall + pose * 100 * DEG;
  const clubLen = walking ? 1.4 * s : 2.3 * s;
  const cx = gx + Math.cos(clubA) * clubLen, cy = gy - Math.sin(clubA) * clubLen;
  return (
    <G>
      <Ellipse cx={gx + 0.3} cy={gy + 0.4} rx={1.7 * s} ry={1.0 * s} fill="#00000055" transform={`rotate(${faceDeg + 90} ${gx + 0.3} ${gy + 0.4})`} />
      {/* club + head */}
      <Line x1={gx} y1={gy} x2={cx} y2={cy} stroke="#D8D8D8" strokeWidth={0.32 * s} strokeLinecap="round" />
      <Circle cx={cx} cy={cy} r={0.42 * s} fill="#B8B8B8" />
      {/* shoulders */}
      <Ellipse cx={gx} cy={gy} rx={1.6 * s * bob} ry={0.85 * s} fill={c.shirt} transform={`rotate(${faceDeg + 90} ${gx} ${gy})`} />
      {/* head + hat */}
      <Circle cx={gx} cy={gy} r={0.78 * s} fill={c.skin} />
      {c.hatStyle !== 'none' && <Circle cx={gx} cy={gy} r={0.62 * s} fill={c.hat} />}
      {c.hatStyle === 'cap' && (
        <Line x1={gx} y1={gy} x2={gx + Math.cos(aim) * 1.1 * s} y2={gy - Math.sin(aim) * 1.1 * s} stroke={c.hat} strokeWidth={0.5 * s} strokeLinecap="round" />
      )}
    </G>
  );
}

export default SwingStage;
