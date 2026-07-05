import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function WelcomeScreen({ navigation }) {
  return (
    <SafeAreaView style={s.container}>
      <View style={s.top}>
        <Text style={s.wordmark}>CLOCKED</Text>
        <Text style={s.tagline}>Golf has a shot clock.</Text>
        <Text style={s.sub}>Track your pace. Own your score.</Text>
      </View>

      <View style={s.buttons}>
        <TouchableOpacity
          style={s.btnPrimary}
          onPress={() => navigation.navigate('SignUp')}
          activeOpacity={0.85}
        >
          <Text style={s.btnPrimaryText}>CREATE ACCOUNT</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={s.btnSecondary}
          onPress={() => navigation.navigate('SignIn')}
          activeOpacity={0.85}
        >
          <Text style={s.btnSecondaryText}>SIGN IN</Text>
        </TouchableOpacity>
      </View>

      <Text style={s.terms}>
        By continuing you agree to our Terms of Service and Privacy Policy.
      </Text>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: {
    flex: 1, backgroundColor: '#090F0A',
    justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 32, paddingTop: 120, paddingBottom: 40,
  },
  top: { alignItems: 'center' },
  wordmark: {
    fontSize: 32, fontWeight: '700', color: '#C9A84C',
    letterSpacing: 12, marginBottom: 24,
  },
  tagline: {
    fontSize: 26, fontWeight: '300', color: '#F5EDD8',
    textAlign: 'center', marginBottom: 10, lineHeight: 34,
  },
  sub: {
    fontSize: 14, color: '#7A6E58', textAlign: 'center',
  },
  buttons: { width: '100%', gap: 14 },
  btnPrimary: {
    backgroundColor: '#C9A84C', borderRadius: 14,
    paddingVertical: 18, alignItems: 'center', width: '100%',
  },
  btnPrimaryText: {
    fontSize: 13, fontWeight: '700', color: '#090F0A', letterSpacing: 2,
  },
  btnSecondary: {
    borderRadius: 14, paddingVertical: 18, alignItems: 'center',
    width: '100%', borderWidth: 1, borderColor: '#C9A84C',
  },
  btnSecondaryText: {
    fontSize: 13, fontWeight: '700', color: '#C9A84C', letterSpacing: 2,
  },
  terms: {
    fontSize: 10, color: '#7A6E5888', textAlign: 'center',
    marginTop: 20, lineHeight: 16,
  },
});
