import { View, Text, TouchableOpacity, StyleSheet, Linking } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

export default function UnderageScreen() {
  return (
    <SafeAreaView style={s.container}>
      <View style={s.content}>
        <View style={s.iconWrap}>
          <Ionicons name="flag" size={52} color="#C9A84C" />
        </View>
        <Text style={s.eyebrow}>CLOCKED GOLF</Text>
        <Text style={s.title}>Age Requirement</Text>
        <Text style={s.body}>
          You must be 13 or older to use Clocked Golf.
        </Text>
        <Text style={s.sub}>
          Clocked Golf is intended for users 13 and older.{'\n'}
          We do not knowingly collect personal data{'\n'}from children under 13.
        </Text>
        <TouchableOpacity
          onPress={() => Linking.openURL('https://clocked.golf/privacy_policy.html')}
          activeOpacity={0.7}
        >
          <Text style={s.link}>Learn more about our Privacy Policy</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#090F0A' },
  content:   { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 40 },
  iconWrap:  { marginBottom: 20 },
  eyebrow:   { fontSize: 10, fontWeight: '700', color: '#C9A84C', letterSpacing: 5, marginBottom: 16 },
  title:     { fontSize: 26, color: '#F5EDD8', fontWeight: '600', marginBottom: 14, textAlign: 'center' },
  body:      { fontSize: 16, color: '#F5EDD8', textAlign: 'center', lineHeight: 26, marginBottom: 14 },
  sub:       { fontSize: 13, color: 'rgba(245,237,216,0.45)', textAlign: 'center', lineHeight: 21, marginBottom: 36 },
  link:      { fontSize: 13, color: '#C9A84C', textDecorationLine: 'underline', textAlign: 'center' },
});
