// ─── PowerMeter — oscillating bar, tap anywhere to lock ───────────────────────
// Pure presentational: the engine owns the value and advances it each frame.
// Color is information: green → gold → red as power climbs.

import { View, Text, StyleSheet } from 'react-native';
import { COLOR, TYPE } from '../../lib/theme';

function colorFor(v) {
  if (v < 0.55) return COLOR.green;
  if (v < 0.85) return COLOR.gold;
  return COLOR.red;
}

export default function PowerMeter({ value = 0, club, locked }) {
  const pct = Math.round(value * 100);
  return (
    <View style={st.wrap}>
      <View style={st.row}>
        <Text style={st.label}>{club?.name ?? 'CLUB'}</Text>
        <Text style={[st.pct, { color: colorFor(value) }]}>{pct}%</Text>
      </View>
      <View style={st.track}>
        {/* tick marks */}
        {[0.25, 0.5, 0.75].map(t => (
          <View key={t} style={[st.tick, { left: `${t * 100}%` }]} />
        ))}
        <View style={[st.fill, { width: `${pct}%`, backgroundColor: colorFor(value) }]} />
        {locked != null && <View style={[st.lockMark, { left: `${Math.round(locked * 100)}%` }]} />}
      </View>
    </View>
  );
}

const st = StyleSheet.create({
  wrap: { width: '100%' },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 },
  label: { ...TYPE.label },
  pct: { ...TYPE.statNumber, fontSize: 22 },
  track: {
    height: 14, borderRadius: 7, backgroundColor: COLOR.surface,
    borderWidth: 1, borderColor: COLOR.border, overflow: 'hidden',
  },
  fill: { position: 'absolute', left: 0, top: 0, bottom: 0, borderRadius: 7 },
  tick: { position: 'absolute', top: 0, bottom: 0, width: 1, backgroundColor: COLOR.border },
  lockMark: { position: 'absolute', top: -2, bottom: -2, width: 2, backgroundColor: COLOR.cream },
});
