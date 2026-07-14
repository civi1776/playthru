import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

// level: 'self_reported' | 'gps_tracked'
export default function VerificationBadge({ level }) {
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
  gps:       { backgroundColor: 'rgba(125,200,122,0.08)', opacity: 0.6 },
  gpsText:   { color: '#7DC87A' },
});
