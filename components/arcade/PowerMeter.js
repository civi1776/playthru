// ─── PowerMeter — oscillating bar, tap anywhere to lock ───────────────────────
// Pure presentational: the engine owns the value and advances it each frame.
// The bar reads in distance, not just percent: the number beside the percent
// is what this power sends the ball, and the notch on the bar is the pin.

import { View, Text, StyleSheet } from 'react-native';
import { COLOR, TYPE } from '../../lib/theme';

function colorFor(v) {
  if (v < 0.55) return COLOR.green;
  if (v < 0.85) return COLOR.gold;
  return COLOR.red;
}

// maxYards: what a full bar sends the ball from this lie. toPin: yards to the hole.
// feet: read distances in feet (putting).
export default function PowerMeter({ value = 0, club, maxYards = 0, toPin = null, feet = false }) {
  const pct = Math.round(value * 100);
  const unit = feet ? 'FT' : 'YDS';
  const k = feet ? 3 : 1;
  const now = Math.round(value * maxYards * k);
  const pinAt = toPin != null && maxYards > 0 ? toPin / maxYards : null;
  const pinOn = pinAt != null && pinAt <= 1;
  const color = colorFor(value);
  return (
    <View style={st.wrap}>
      <View style={st.row}>
        <Text style={st.label} numberOfLines={1}>{club?.name ?? 'CLUB'} <Text style={st.pct}>{pct}%</Text></Text>
        <Text style={[st.yards, { color }]}>{now}<Text style={st.unit}> {unit}</Text></Text>
      </View>
      <View style={st.trackBox}>
        <View style={st.track}>
          {[0.25, 0.5, 0.75].map(t => (
            <View key={t} style={[st.tick, { left: `${t * 100}%` }]} />
          ))}
          <View style={[st.fill, { width: `${pct}%`, backgroundColor: color }]} />
        </View>
        {pinOn && <View style={[st.pin, { left: `${Math.max(0, Math.min(100, pinAt * 100))}%` }]} />}
      </View>
      <View style={st.row2}>
        <Text style={st.foot}>
          {pinAt == null ? ' ' : pinOn ? `PIN ${Math.round(toPin * k)} ${unit}` : `PIN ${Math.round(toPin * k)} ${unit} · OUT OF RANGE`}
        </Text>
        <Text style={st.foot}>FULL {Math.round(maxYards * k)}</Text>
      </View>
    </View>
  );
}

const st = StyleSheet.create({
  wrap: { width: '100%' },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 },
  row2: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 5 },
  label: { ...TYPE.label, flexShrink: 1 },
  pct: { ...TYPE.label, color: COLOR.muted, fontVariant: ['tabular-nums'] },
  yards: { ...TYPE.statNumber, fontSize: 22, lineHeight: 26, minWidth: 92, textAlign: 'right' },
  unit: { fontSize: 10, letterSpacing: 1, color: COLOR.dim, fontWeight: '700' },
  trackBox: { height: 22, justifyContent: 'center' },
  track: {
    height: 14, borderRadius: 7, backgroundColor: COLOR.bg,
    borderWidth: 1, borderColor: COLOR.border, overflow: 'hidden',
  },
  fill: { position: 'absolute', left: 0, top: 0, bottom: 0, borderRadius: 7 },
  tick: { position: 'absolute', top: 0, bottom: 0, width: 1, backgroundColor: COLOR.border },
  pin: { position: 'absolute', top: 0, bottom: 0, width: 3, marginLeft: -1.5, borderRadius: 1.5, backgroundColor: COLOR.cream },
  foot: { ...TYPE.label, fontSize: 8, letterSpacing: 1.5 },
});
