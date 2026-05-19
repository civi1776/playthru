import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

/**
 * CaddyBadge — shown on any round that has caddy_logged = true
 * or verification_level = 'caddy_corroborated'.
 *
 * size: 'sm' (default) | 'lg'
 */
export default function CaddyBadge({ size = 'sm', style }) {
  const lg = size === 'lg';
  return (
    <View style={[s.badge, lg && s.badgeLg, style]}>
      <Ionicons name="checkmark-circle" size={lg ? 13 : 10} color="#090F0A" />
      <Text style={[s.text, lg && s.textLg]}>CADDY VERIFIED</Text>
    </View>
  );
}

const s = StyleSheet.create({
  badge:   {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: '#C9A84C', borderRadius: 5,
    paddingHorizontal: 6, paddingVertical: 3,
    alignSelf: 'flex-start',
  },
  badgeLg: { paddingHorizontal: 9, paddingVertical: 4, borderRadius: 7 },
  text:    { fontSize: 7, fontWeight: '700', color: '#090F0A', letterSpacing: 1.2 },
  textLg:  { fontSize: 9 },
});
