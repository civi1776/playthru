// ─── TurboButton — cart boost with a charge ring ─────────────────────────────
// Pure presentational: the engine owns the cooldown (physics.turboState).

import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { Ionicons } from '@expo/vector-icons';
import { COLOR } from '../../lib/theme';

const SIZE = 74, STROKE = 4, R = (SIZE - STROKE) / 2, CIRC = 2 * Math.PI * R;

export default function TurboButton({ charge = 1, active = false, ready = true, onPress, disabled }) {
  const color = active ? COLOR.goldBright : ready ? COLOR.gold : COLOR.dim;
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled || (!ready && !active)}
      activeOpacity={0.8}
      style={[st.wrap, disabled && { opacity: 0.35 }]}
      accessibilityRole="button"
      accessibilityLabel="Turbo boost"
      accessibilityState={{ disabled: !ready }}
    >
      <Svg width={SIZE} height={SIZE} style={StyleSheet.absoluteFill}>
        <Circle cx={SIZE / 2} cy={SIZE / 2} r={R} stroke={COLOR.border} strokeWidth={STROKE} fill={active ? '#C9A84C22' : COLOR.surface} />
        <Circle
          cx={SIZE / 2} cy={SIZE / 2} r={R} stroke={color} strokeWidth={STROKE} fill="none"
          strokeDasharray={`${CIRC}`} strokeDashoffset={CIRC * (1 - charge)} strokeLinecap="round"
          transform={`rotate(-90 ${SIZE / 2} ${SIZE / 2})`}
        />
      </Svg>
      <Ionicons name="flash" size={22} color={color} />
      <Text style={[st.label, { color }]}>{active ? 'BOOST' : ready ? 'TURBO' : `${Math.round(charge * 100)}%`}</Text>
    </TouchableOpacity>
  );
}

const st = StyleSheet.create({
  wrap: { width: SIZE, height: SIZE, alignItems: 'center', justifyContent: 'center' },
  label: { fontSize: 8, fontWeight: '800', letterSpacing: 1.5, marginTop: 2 },
});
