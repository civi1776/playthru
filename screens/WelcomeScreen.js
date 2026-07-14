import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function WelcomeScreen({ navigation }) {
  return (
    <SafeAreaView style={s.container}>
      {/* Upper third — wordmark */}
      <View style={s.upper}>
        <Text style={s.wordmark}>CLOCKED</Text>
      </View>

      {/* Center block — hero copy */}
      <View style={s.center}>
        <Text style={s.heroLight}>Golf has a</Text>
        <Text style={s.heroBold}>shot clock.</Text>
        <Text style={s.sub}>
          Play on the clock. Earn your score.{'\n'}Climb the rankings.
        </Text>
      </View>

      {/* Bottom block — CTAs */}
      <View style={s.bottom}>
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

        <Text style={s.legal}>
          By continuing you agree to our Terms & Privacy Policy.
        </Text>
      </View>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: {
    flex: 1, backgroundColor: '#090F0A',
    justifyContent: 'space-between',
    paddingBottom: 32,
  },
  upper: {
    alignItems: 'center',
    paddingTop: 60,
  },
  wordmark: {
    fontSize: 13, fontWeight: '700', color: '#F5EDD8',
    letterSpacing: 6,
  },
  center: {
    paddingHorizontal: 28,
  },
  heroLight: {
    fontSize: 40, fontWeight: '200', color: '#F5EDD8',
    lineHeight: 48,
  },
  heroBold: {
    fontSize: 40, fontWeight: '700', color: '#F0CB5B',
    lineHeight: 48,
  },
  sub: {
    fontSize: 15, color: '#B8A882', lineHeight: 22,
    marginTop: 16,
  },
  bottom: {
    paddingHorizontal: 28,
  },
  btnPrimary: {
    backgroundColor: '#C9A84C', borderRadius: 14,
    paddingVertical: 17, alignItems: 'center', width: '100%',
  },
  btnPrimaryText: {
    fontSize: 13, fontWeight: '700', color: '#090F0A', letterSpacing: 1.5,
  },
  btnSecondary: {
    borderRadius: 14, paddingVertical: 17, alignItems: 'center',
    width: '100%', borderWidth: 1, borderColor: '#C9A84C55',
    marginTop: 12,
  },
  btnSecondaryText: {
    fontSize: 13, fontWeight: '700', color: '#C9A84C', letterSpacing: 1.5,
  },
  legal: {
    fontSize: 10, color: '#7A6E5888', textAlign: 'center',
    marginTop: 20, lineHeight: 16,
  },
});
