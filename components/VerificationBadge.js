import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

// level: 'self_reported' | 'caddy_corroborated' | 'gps_tracked'
export default function VerificationBadge({ level }) {
  if (level === 'caddy_corroborated') {
    return (
      <View style={[b.badge, b.caddy]}>
        <Ionicons name="checkmark-circle" size={10} color="#C9A84C" style={{ marginRight: 3 }} />
        <Text style={[b.text, b.caddyText]}>Caddy Verified</Text>
      </View>
    );
  }
  if (level === 'gps_tracked') {
    return (
      <View style={[b.badge, b.gps]}>
        <Ionicons name="navigate" size={10} color="#7DC87A" style={{ marginRight: 3 }} />
        <Text style={[b.text, b.gpsText]}>GPS Tracked</Text>
      </View>
    );
  }
  // Default: self_reported or null
  return (
    <View style={[b.badge, b.self]}>
      <Text style={[b.text, b.selfText]}>Self Reported</Text>
    </View>
  );
}

const b = StyleSheet.create({
  badge:     { flexDirection: 'row', alignItems: 'center', borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2 },
  text:      { fontSize: 9, fontWeight: '700', letterSpacing: 0.4 },
  self:      { backgroundColor: 'rgba(122,110,88,0.12)' },
  selfText:  { color: '#7A6E58' },
  caddy:     { backgroundColor: 'rgba(201,168,76,0.12)', borderWidth: 1, borderColor: 'rgba(201,168,76,0.35)' },
  caddyText: { color: '#C9A84C' },
  gps:       { backgroundColor: 'rgba(125,200,122,0.08)', opacity: 0.6 },
  gpsText:   { color: '#7DC87A' },
});
