// ─── ArcadeHUD — running telemetry + the verdict beat ────────────────────────
// Same visual language as the real round: a countdown ring, tabular numbers,
// letterspaced labels. The HUD takes whole seconds, so it re-renders once a
// second instead of once a frame. Every block has a fixed width and a fixed
// height: nothing in the top bar moves when a number or a streak appears.

import { memo, useEffect, useRef } from 'react';
import { View, Text, Animated, Easing, StyleSheet } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import CountdownRing from '../CountdownRing';
import { COLOR, TYPE, MOTION } from '../../lib/theme';
import { formatSeconds } from '../../lib/clockedSport';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);
const RING = 64;
const MINUS = '−';
export const FINAL_SECONDS = 10;

// Arcade clocks are short (a 40 second par is normal), so the zones follow the
// share of time par that is left, not the fixed last minute of a real round.
export function arcadeClockZone(remaining, timePar) {
  if (remaining <= 0 || remaining <= 15 || remaining <= timePar * 0.2) return 'red';
  if (remaining <= timePar * 0.5) return 'amber';
  return 'green';
}
const ZONE_COLOR = { green: COLOR.green, amber: COLOR.amber, red: COLOR.red };

const signed = (n) => (n > 0 ? `+${n}` : n < 0 ? `${MINUS}${Math.abs(n)}` : '0');

// clockState: 'armed' (hole 1 before the first swing) | 'live' | 'stopped'
function ArcadeHUD({ holeNumber, par, strokes, points, timePar, remaining, clockState = 'live', streak = 0 }) {
  const live = clockState === 'live';
  const armed = clockState === 'armed';
  const over = remaining < 0;
  const zone = armed ? 'green' : arcadeClockZone(remaining, timePar);
  const color = armed ? COLOR.dim : ZONE_COLOR[zone];
  const progress = timePar > 0 ? Math.max(0, Math.min(1, remaining / timePar)) : 1;
  const final = live && remaining <= FINAL_SECONDS;
  const pulse = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    let loop;
    if (zone === 'red' && live) {
      loop = Animated.loop(Animated.sequence([
        Animated.timing(pulse, { toValue: 0.45, duration: final ? 250 : 500, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1, duration: final ? 250 : 500, useNativeDriver: true }),
      ]));
      loop.start();
    } else pulse.setValue(1);
    return () => loop?.stop();
  }, [zone, live, final]);

  const label = armed ? 'CLOCK ARMED' : !live ? 'STOPPED' : over ? 'OVER' : `PAR ${formatSeconds(timePar)}`;
  const digits = over ? `+${formatSeconds(-remaining)}` : formatSeconds(Math.max(0, remaining));

  return (
    <View style={st.bar}>
      <Stat label="HOLE" value={String(holeNumber)} />
      <Stat label="PAR" value={String(par)} />
      <Stat label="STROKES" value={String(strokes)} />
      <Stat label="PTS" value={signed(points)} color={points > 0 ? COLOR.green : points < 0 ? COLOR.red : COLOR.cream} />
      <View style={st.clockWrap} accessibilityLabel={`Hole clock ${digits}. ${label}.`}>
        <Animated.View style={{ opacity: pulse }}>
          <CountdownRing progress={progress} size={RING} strokeWidth={final ? 5 : 4} color={color} trackColor={COLOR.bg} duration={900}>
            <Text style={[st.clockDigits, final && st.clockDigitsFinal, { color }]} numberOfLines={1}>{digits}</Text>
          </CountdownRing>
        </Animated.View>
        <Text style={[st.clockLabel, live && zone !== 'green' && { color }]} numberOfLines={1}>{label}</Text>
        <Text style={[st.heat, streak > 0 ? null : st.heatOff]} numberOfLines={1}>
          {streak > 0 ? `${streak} IN A ROW` : ' '}
        </Text>
      </View>
    </View>
  );
}
export default memo(ArcadeHUD);

function Stat({ label, value, color = COLOR.cream }) {
  return (
    <View style={st.stat}>
      <Text style={st.statLabel} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>{label}</Text>
      <Text style={[st.statValue, { color }]} numberOfLines={1}>{value}</Text>
    </View>
  );
}

// ─── Verdict overlay ─────────────────────────────────────────────────────────
// The clock result, then the sum: what the strokes paid, what the clock took,
// what the streak added, and the hole total on its own line.
// verdict: { key, beat, timedOut, delta, color, label, strokePoints, penalty,
//            bonus, total, pickedUp, streak }
export const VerdictOverlay = memo(function VerdictOverlay({ verdict }) {
  const scale = useRef(new Animated.Value(0.6)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  const flash = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!verdict?.key) return;
    scale.setValue(0.6); opacity.setValue(0); flash.setValue(0);
    Animated.parallel([
      Animated.timing(opacity, { toValue: 1, duration: MOTION.fast, useNativeDriver: true }),
      Animated.timing(scale, { toValue: 1, duration: MOTION.standard, easing: Easing.out(Easing.back(1.4)), useNativeDriver: true }),
    ]).start();
    // Two sharp pulses — timing board, not fireworks (mirrors the real ring flash).
    Animated.sequence([
      Animated.timing(flash, { toValue: 1,    duration: 120, easing: Easing.out(Easing.quad), useNativeDriver: false }),
      Animated.timing(flash, { toValue: 0.25, duration: 220, useNativeDriver: false }),
      Animated.timing(flash, { toValue: 1,    duration: 160, useNativeDriver: false }),
      Animated.timing(flash, { toValue: 0,    duration: Math.max(100, MOTION.verdictHold - 500), useNativeDriver: false }),
    ]).start();
  }, [verdict?.key]);

  if (!verdict) return null;
  const size = 268, sw = 6, r = (size - sw) / 2;
  const v = verdict;
  const totalColor = v.total > 0 ? COLOR.green : v.total < 0 ? COLOR.red : COLOR.cream;
  const toHeat = v.streak > 0 && v.streak % 3 !== 0 ? 3 - (v.streak % 3) : 0;

  return (
    <View style={st.verdictWrap} pointerEvents="none">
      <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
        <Svg width={size} height={size} style={{ position: 'absolute' }}>
          <Circle cx={size / 2} cy={size / 2} r={r} stroke={v.color} strokeWidth={sw} fill={COLOR.bg} fillOpacity={0.9} />
          <AnimatedCircle cx={size / 2} cy={size / 2} r={r} stroke={v.color} strokeWidth={sw + 3} fill="none" opacity={flash} />
        </Svg>
        <Animated.View style={[st.verdictCenter, { opacity, transform: [{ scale }] }]} accessibilityLiveRegion="polite">
          <Text style={[st.verdictHeadline, { color: v.color }]}>
            {v.timedOut ? 'OUT OF TIME' : v.beat ? 'BEAT THE CLOCK' : 'OVER THE CLOCK'}
          </Text>
          {!v.timedOut && (
            <View style={st.verdictDeltaRow}>
              <Text style={[st.verdictBy, { color: v.color }]}>by</Text>
              <Text style={[st.verdictDelta, { color: v.color }]}>{formatSeconds(v.delta)}</Text>
            </View>
          )}
          <View style={st.ledger}>
            <LedgerRow label={v.pickedUp && !v.timedOut ? `${v.label} · PICKED UP` : v.label} value={v.strokePoints} />
            {v.penalty < 0 && <LedgerRow label={v.timedOut ? 'OUT OF TIME' : 'CLOCK'} value={v.penalty} color={COLOR.red} />}
            {v.bonus > 0 && <LedgerRow label="HEAT" value={v.bonus} color={COLOR.gold} />}
            <View style={st.ledgerRule} />
            <View style={st.ledgerLine}>
              <Text style={[st.ledgerTotalLabel, { color: totalColor }]}>THIS HOLE</Text>
              <Text style={[st.ledgerTotal, { color: totalColor }]}>{signed(v.total)}</Text>
            </View>
          </View>
          {v.beat && v.streak > 0 && (
            <View style={st.streakBlock}>
              <Text style={st.streakTop}>{v.streak} IN A ROW</Text>
              {toHeat > 0 && <Text style={st.streakSub}>{toHeat} MORE FOR HEAT</Text>}
            </View>
          )}
        </Animated.View>
      </View>
      <Text style={st.tapOn}>TAP TO CONTINUE</Text>
    </View>
  );
});

function LedgerRow({ label, value, color = COLOR.muted }) {
  return (
    <View style={st.ledgerLine}>
      <Text style={[st.ledgerLabel, { color }]} numberOfLines={1}>{String(label ?? '').toUpperCase()}</Text>
      <Text style={[st.ledgerValue, { color }]}>{signed(value)}</Text>
    </View>
  );
}

const st = StyleSheet.create({
  bar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 8, height: 108,
    backgroundColor: COLOR.surface, borderBottomWidth: 1, borderBottomColor: COLOR.border,
  },
  stat: { alignItems: 'flex-start', width: 58 },
  statLabel: { ...TYPE.label },
  statValue: { ...TYPE.statNumber, fontSize: 24, lineHeight: 30, color: COLOR.cream, marginTop: 2 },
  clockWrap: { alignItems: 'center', width: 96 },
  clockDigits: { ...TYPE.statNumber, fontSize: 15, lineHeight: 22, width: 54, textAlign: 'center' },
  clockDigitsFinal: { fontSize: 19, fontWeight: '500' },
  clockLabel: { ...TYPE.label, fontSize: 8, lineHeight: 11, marginTop: 3 },
  heat: { fontSize: 8, lineHeight: 11, fontWeight: '800', color: COLOR.gold, letterSpacing: 1, marginTop: 2 },
  heatOff: { opacity: 0 },

  verdictWrap: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
  verdictCenter: { alignItems: 'center', justifyContent: 'center' },
  verdictHeadline: { ...TYPE.label, fontSize: 12, letterSpacing: 3, textAlign: 'center' },
  verdictDeltaRow: { flexDirection: 'row', alignItems: 'baseline', gap: 8, marginTop: 2 },
  verdictBy: { fontSize: 16, fontWeight: '300', letterSpacing: 0.5, opacity: 0.85 },
  verdictDelta: { ...TYPE.heroNumber, fontSize: 44, lineHeight: 48 },
  ledger: { width: 168, marginTop: 8 },
  ledgerLine: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', paddingVertical: 2 },
  ledgerLabel: { ...TYPE.label, fontSize: 10, letterSpacing: 1.5, flexShrink: 1, paddingRight: 8 },
  ledgerValue: { ...TYPE.statNumber, fontSize: 14, fontWeight: '500', width: 34, textAlign: 'right' },
  ledgerRule: { height: 1, backgroundColor: COLOR.border, marginVertical: 4 },
  ledgerTotalLabel: { ...TYPE.label, fontSize: 11, letterSpacing: 2 },
  ledgerTotal: { ...TYPE.statNumber, fontSize: 20, fontWeight: '500', width: 44, textAlign: 'right' },
  streakBlock: { alignItems: 'center', marginTop: 6 },
  streakTop: { ...TYPE.label, fontSize: 10, color: COLOR.gold, letterSpacing: 2 },
  streakSub: { ...TYPE.label, fontSize: 9, color: COLOR.dim, letterSpacing: 1.5, marginTop: 2 },
  tapOn: { ...TYPE.label, fontSize: 9, color: COLOR.cream, opacity: 0.7, letterSpacing: 2.5, marginTop: 12 },
});
