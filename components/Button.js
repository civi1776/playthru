// ─── Button — the one button set ─────────────────────────────────────────────
// primary (gold fill), secondary (outlined), destructive (outlined red),
// plus `color` for the rare case where the fill is information (Start Hole
// is green). Full-width by default; pass `inline` for a content-sized one.

import { TouchableOpacity, Text, ActivityIndicator, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLOR, RADIUS } from '../lib/theme';

export default function Button({ label, onPress, variant = 'primary', icon, color, loading, disabled, inline, size = 'md', style, textStyle, accessibilityLabel }) {
  const fill = variant === 'primary' ? (color ?? COLOR.gold) : 'transparent';
  const edge = variant === 'destructive' ? COLOR.red : variant === 'secondary' ? (color ?? COLOR.gold) : fill;
  const ink  = variant === 'primary' ? COLOR.bg : edge;
  const pad  = size === 'sm' ? 10 : size === 'lg' ? 18 : 15;
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled || loading}
      activeOpacity={0.85}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled: !!disabled }}
      style={[s.base, { backgroundColor: fill, borderColor: edge, paddingVertical: pad }, inline && s.inline, (disabled || loading) && s.disabled, style]}
    >
      {loading ? <ActivityIndicator color={ink} /> : (
        <View style={s.row}>
          {!!icon && <Ionicons name={icon} size={size === 'sm' ? 14 : 18} color={ink} />}
          <Text style={[s.label, size === 'sm' && s.labelSm, { color: ink }, textStyle]}>{label}</Text>
        </View>
      )}
    </TouchableOpacity>
  );
}

const s = StyleSheet.create({
  base:     { borderRadius: RADIUS.md, borderWidth: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 20, alignSelf: 'stretch' },
  inline:   { alignSelf: 'flex-start' },
  disabled: { opacity: 0.5 },
  row:      { flexDirection: 'row', alignItems: 'center', gap: 9 },
  label:    { fontSize: 13, fontWeight: '800', letterSpacing: 2.5 },
  labelSm:  { fontSize: 10, letterSpacing: 1.5 },
});
