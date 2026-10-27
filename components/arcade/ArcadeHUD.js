// ─── ArcadeHUD — running telemetry + the verdict beat ────────────────────────
// Same visual language as the real round: countdown ring (green → gold →
// pulsing red), tabular hero numbers, letterspaced labels. VerdictOverlay is
// a faithful miniature of ClockedRoundScreen's holed-out moment —
// "BEAT THE CLOCK / by 0:41" with a double ring pulse in the verdict color.

import { useEffect, useRef } from 'react';
import { View, Text, Animated, Easing, StyleSheet } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import CountdownRing from '../CountdownRing';
import { COLOR, TYPE, MOTION, ringZone, ringColorForZone } from '../../lib/theme';
import { formatSeconds } from '../../lib/clockedSport';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);
const RING = 64;

export default function ArcadeHUD({ holeNumber, par, strokes, points, timePar, elapsed, clockLive, lie, club }) {
  const remaining = Math.ceil(timePar - elapsed);
  const over = remaining < 0;
  const zone = clockLive ? ringZone(remaining, timePar) : 'green';
  const color = clockLive ? ringColorForZone(zone) : COLOR.dim;
  const progress = timePar > 0 ? Math.max(0, Math.min(1, remaining / timePar)) : 1;
  const pulse = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    let loop;
    if (zone === 'red' && clockLive) {
      loop = Animated.loop(Animated.sequence([
        Animated.timing(pulse, { toValue: 0.45, duration: 500, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1, duration: 500, useNativeDriver: true }),
      ]));
      loop.start();
    } else pulse.setValue(1);
    return () => loop?.stop();
  }, [zone, clockLive]);

  return (
    <View style={st.bar}>
      <Stat label="HOLE" value={String(holeNumber)} />
      <Stat label="PAR" value={String(par)} />
      <Stat label="STROKES" value={String(strokes)} />
      <Stat label="PTS" value={points > 0 ? `+${points}` : String(points)} color={points > 0 ? COLOR.green : points < 0 ? COLOR.red : COLOR.cream} />
      <View style={st.clockWrap}>
        <Animated.View style={{ opacity: pulse }}>
          <CountdownRing progress={progress} size={RING} strokeWidth={4} color={color} trackColor={COLOR.surface} duration={900}>
            <Text style={[st.clockDigits, { color }]}>{over ? `+${formatSeconds(-remaining)}` : formatSeconds(Math.max(0, remaining))}</Text>
          </CountdownRing>
        </Animated.View>
        <Text style={st.clockLabel}>{clockLive ? (over ? 'OVER' : `TP ${formatSeconds(timePar)}`) : 'CLOCK ARMED'}</Text>
      </View>
    </View>
  );
}

function Stat({ label, value, color = COLOR.cream }) {
  return (
    <View style={st.stat}>
      <Text style={st.statLabel}>{label}</Text>
      <Text style={[st.statValue, { color }]}>{value}</Text>
    </View>
  );
}

// ─── Verdict overlay ─────────────────────────────────────────────────────────
// verdict: { beat, delta, color, key, label, points, pickedUp }
export function VerdictOverlay({ verdict }) {
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
  const size = 230, sw = 6, r = (size - sw) / 2;

  return (
    <View style={st.verdictWrap} pointerEvents="none">
      <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
        <Svg width={size} height={size} style={{ position: 'absolute' }}>
          <Circle cx={size / 2} cy={size / 2} r={r} stroke={verdict.color} strokeWidth={sw} fill={COLOR.bg} fillOpacity={0.82} />
          <AnimatedCircle cx={size / 2} cy={size / 2} r={r} stroke={verdict.color} strokeWidth={sw + 3} fill="none" opacity={flash} />
        </Svg>
        <Animated.View style={[st.verdictCenter, { opacity, transform: [{ scale }] }]} accessibilityLiveRegion="polite">
          <Text style={[st.verdictHeadline, { color: verdict.color }]}>
            {verdict.beat ? 'BEAT THE CLOCK' : 'OVER THE CLOCK'}
          </Text>
          <View style={st.verdictDeltaRow}>
            <Text style={[st.verdictBy, { color: verdict.color }]}>by</Text>
            <Text style={[st.verdictDelta, { color: verdict.color }]}>{formatSeconds(verdict.delta)}</Text>
          </View>
          <Text style={st.verdictResult}>
            {verdict.pickedUp ? 'PICKED UP · ' : ''}{(verdict.label ?? '').toUpperCase()}  {verdict.points > 0 ? `+${verdict.points}` : verdict.points} PTS
          </Text>
        </Animated.View>
      </View>
    </View>
  );
}

const st = StyleSheet.create({
  bar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 8,
    backgroundColor: COLOR.surface, borderBottomWidth: 1, borderBottomColor: COLOR.border,
  },
  stat: { alignItems: 'flex-start', minWidth: 50 },
  statLabel: { ...TYPE.label },
  statValue: { ...TYPE.statNumber, fontSize: 24, color: COLOR.cream, marginTop: 2 },
  clockWrap: { alignItems: 'center' },
  clockDigits: { ...TYPE.statNumber, fontSize: 15 },
  clockLabel: { ...TYPE.label, fontSize: 8, marginTop: 2 },

  verdictWrap: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
  verdictCenter: { alignItems: 'center', justifyContent: 'center' },
  verdictHeadline: { ...TYPE.label, fontSize: 12, letterSpacing: 3, textAlign: 'center' },
  verdictDeltaRow: { flexDirection: 'row', alignItems: 'baseline', gap: 8, marginTop: 4 },
  verdictBy: { fontSize: 18, fontWeight: '300', letterSpacing: 0.5, opacity: 0.85 },
  verdictDelta: { ...TYPE.heroNumber, fontSize: 56, lineHeight: 60 },
  verdictResult: { ...TYPE.label, color: COLOR.muted, marginTop: 6, letterSpacing: 2 },
});
