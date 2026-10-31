// ─── ScreenHeader — the two header patterns the app uses ─────────────────────
// Tab roots:    <ScreenHeader title="CLOCKED" brand right={[...]} />
//               left-aligned wordmark (gold, with the logo mark when `brand`),
//               up to two bare icon buttons on the right.
// Pushed:       <ScreenHeader title="SETTINGS" onBack={...} right={[...]} />
//               back chevron, centered title in cream, optional icon.
// `right` is an array of { icon, onPress, label } or a React node.

import { View, Text, TouchableOpacity, Image, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLOR, TYPE } from '../lib/theme';

export default function ScreenHeader({ title, subtitle, onBack, brand = false, right = null, borderless = false, style }) {
  const pushed = typeof onBack === 'function';
  const rightNodes = Array.isArray(right)
    ? right.map((r, i) => (
        <TouchableOpacity key={r.label ?? i} onPress={r.onPress} style={s.iconBtn} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel={r.label} hitSlop={6}>
          <Ionicons name={r.icon} size={pushed ? 20 : 22} color={r.color ?? COLOR.muted} />
        </TouchableOpacity>
      ))
    : right;

  if (pushed) {
    return (
      <View style={[s.bar, s.pushed, !borderless && s.border, style]}>
        <TouchableOpacity onPress={onBack} style={s.iconBtn} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel="Back" hitSlop={8}>
          <Ionicons name="chevron-back" size={22} color={COLOR.gold} />
        </TouchableOpacity>
        <View style={s.center}>
          <Text style={s.pushedTitle} numberOfLines={1}>{title}</Text>
          {!!subtitle && <Text style={s.pushedSub} numberOfLines={1}>{subtitle}</Text>}
        </View>
        <View style={s.side}>{rightNodes ?? <View style={s.iconBtn} />}</View>
      </View>
    );
  }

  return (
    <View style={[s.bar, s.root, style]}>
      <View style={s.brandRow}>
        {brand && <Image source={require('../assets/PlayThru_Logo.png')} style={s.mark} resizeMode="contain" accessibilityIgnoresInvertColors />}
        <View>
          <Text style={s.rootTitle}>{title}</Text>
          {!!subtitle && <Text style={s.rootSub}>{subtitle}</Text>}
        </View>
      </View>
      <View style={s.rightRow}>{rightNodes}</View>
    </View>
  );
}

const s = StyleSheet.create({
  bar:        { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  root:       { paddingHorizontal: 20, paddingTop: 10, paddingBottom: 10 },
  pushed:     { paddingHorizontal: 8, paddingVertical: 6 },
  border:     { borderBottomWidth: 1, borderBottomColor: COLOR.border },
  brandRow:   { flexDirection: 'row', alignItems: 'center', gap: 10 },
  mark:       { width: 30, height: 20, tintColor: COLOR.gold },
  rootTitle:  { ...TYPE.display, fontSize: 15, color: COLOR.gold, letterSpacing: 5 },
  rootSub:    { fontSize: 9, color: COLOR.dim, letterSpacing: 1.5, marginTop: 3, textTransform: 'uppercase' },
  rightRow:   { flexDirection: 'row', alignItems: 'center', gap: 4 },
  center:     { flex: 1, alignItems: 'center' },
  side:       { minWidth: 40, flexDirection: 'row', justifyContent: 'flex-end' },
  pushedTitle:{ ...TYPE.display, fontSize: 12, color: COLOR.cream, letterSpacing: 3 },
  pushedSub:  { fontSize: 11, color: COLOR.dim, marginTop: 2 },
  iconBtn:    { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
});
