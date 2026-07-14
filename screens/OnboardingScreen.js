import { useState, useRef } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Dimensions, FlatList } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { LinearGradient } from 'expo-linear-gradient';

const { width: SW } = Dimensions.get('window');

const GOLD  = '#C9A84C';
const CREAM = '#F5EDD8';
const DIM   = '#7A6E58';
const BG    = '#090F0A';

// ─── Screen 1: The Clock ─────────────────────────────────────────────────────
function ScreenClock() {
  return (
    <View style={s.page}>
      <View style={s.visual}>
        <Text style={s.timeParLabel}>TIME PAR</Text>
        <Text style={s.clockReadout}>6:30</Text>
      </View>
      <Text style={s.headline}>Every hole has a time par.</Text>
      <Text style={s.line}>Beat the clock, keep your points. Blow it, pay the penalty.</Text>
    </View>
  );
}

// ─── Screen 2: The Score ─────────────────────────────────────────────────────
function ScreenScore() {
  return (
    <View style={s.page}>
      <View style={s.visual}>
        <View style={{ flexDirection: 'row', alignItems: 'baseline' }}>
          <Text style={s.scoreNum}>87</Text>
          <Text style={s.scoreMax}>/100</Text>
        </View>
        <View style={s.barTrack}>
          <LinearGradient
            colors={['#7DC87A', '#C9A84C', '#F0CB5B']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={[s.barFill, { width: '87%' }]}
          />
        </View>
      </View>
      <Text style={s.headline}>Earn your Clocked Score.</Text>
      <Text style={s.line}>One number for how fast and how well you play. It follows you to every course.</Text>
    </View>
  );
}

// ─── Screen 3: The Rankings ──────────────────────────────────────────────────
function ScreenRankings() {
  return (
    <View style={s.page}>
      <View style={s.visual}>
        <View style={s.lbRow}>
          <Text style={s.lbRank}>#1</Text>
          <Text style={s.lbName}>Jackson M.</Text>
          <Text style={s.lbScore}>94</Text>
        </View>
        <View style={[s.lbRow, s.lbRowYou]}>
          <Text style={[s.lbRank, s.lbYouText]}>#2</Text>
          <Text style={[s.lbName, s.lbYouText]}>You</Text>
          <Text style={[s.lbScore, s.lbYouText]}>87</Text>
        </View>
        <View style={s.lbRow}>
          <Text style={s.lbRank}>#3</Text>
          <Text style={s.lbName}>Sarah K.</Text>
          <Text style={s.lbScore}>82</Text>
        </View>
      </View>
      <Text style={s.headline}>Climb the rankings.</Text>
      <Text style={s.line}>Every round counts. See where you stand — at your course and nationwide.</Text>
    </View>
  );
}

const SCREENS = [ScreenClock, ScreenScore, ScreenRankings];

export default function OnboardingScreen({ navigation }) {
  const [page, setPage] = useState(0);
  const flatListRef = useRef(null);
  const isFinal = page === SCREENS.length - 1;

  const skip = async () => {
    await AsyncStorage.setItem('onboarding_complete', 'true');
    navigation.reset({ index: 0, routes: [{ name: 'Main' }] });
  };

  const handleCTA = async () => {
    await AsyncStorage.setItem('onboarding_complete', 'true');
    navigation.reset({ index: 0, routes: [{ name: 'Main' }] });
  };

  return (
    <SafeAreaView style={s.container}>
      {/* Skip */}
      {!isFinal && (
        <TouchableOpacity style={s.skipBtn} onPress={skip} activeOpacity={0.7}>
          <Text style={s.skipText}>SKIP</Text>
        </TouchableOpacity>
      )}

      {/* Pager */}
      <FlatList
        ref={flatListRef}
        data={SCREENS}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        keyExtractor={(_, i) => String(i)}
        renderItem={({ item: Screen }) => <Screen />}
        onMomentumScrollEnd={(e) => {
          const idx = Math.round(e.nativeEvent.contentOffset.x / SW);
          setPage(idx);
        }}
      />

      {/* Bottom: dots + CTA */}
      <View style={s.bottomWrap}>
        {/* Dots */}
        <View style={s.dotsRow}>
          {SCREENS.map((_, i) => (
            <View key={i} style={[s.dot, i === page && s.dotActive]} />
          ))}
        </View>

        {/* Final CTA */}
        {isFinal && (
          <TouchableOpacity style={s.ctaBtn} onPress={handleCTA} activeOpacity={0.85}>
            <Text style={s.ctaText}>PLAY YOUR FIRST ROUND</Text>
          </TouchableOpacity>
        )}
      </View>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: BG },
  skipBtn:   { position: 'absolute', top: 16, right: 20, zIndex: 10, padding: 8 },
  skipText:  { fontSize: 11, fontWeight: '700', color: DIM, letterSpacing: 1.5 },

  page: {
    width: SW, flex: 1,
    alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: 32,
  },
  visual:    { marginBottom: 32, alignItems: 'center' },

  // Screen 1 — Clock
  timeParLabel: { fontSize: 10, fontWeight: '700', color: GOLD, letterSpacing: 3, marginBottom: 8 },
  clockReadout: { fontSize: 88, fontWeight: '200', color: CREAM, fontVariant: ['tabular-nums'], letterSpacing: -2 },

  // Screen 2 — Score
  scoreNum:  { fontSize: 88, fontWeight: '200', color: GOLD, fontVariant: ['tabular-nums'] },
  scoreMax:  { fontSize: 28, fontWeight: '300', color: DIM, marginLeft: 4 },
  barTrack:  { width: 200, height: 6, borderRadius: 3, backgroundColor: '#1A2E1C', marginTop: 12, overflow: 'hidden' },
  barFill:   { height: 6, borderRadius: 3 },

  // Screen 3 — Rankings
  lbRow:     { flexDirection: 'row', alignItems: 'center', width: 220, paddingVertical: 12, paddingHorizontal: 16, borderBottomWidth: 1, borderBottomColor: '#7DC87A11' },
  lbRowYou:  { backgroundColor: '#C9A84C18', borderRadius: 10, borderBottomWidth: 0 },
  lbRank:    { fontSize: 14, fontWeight: '700', color: DIM, width: 36 },
  lbName:    { fontSize: 14, fontWeight: '500', color: CREAM, flex: 1 },
  lbScore:   { fontSize: 18, fontWeight: '300', color: CREAM, fontVariant: ['tabular-nums'] },
  lbYouText: { color: GOLD },

  // Copy
  headline:  { fontSize: 24, fontWeight: '600', color: CREAM, textAlign: 'center', marginBottom: 12 },
  line:      { fontSize: 15, color: '#B8A882', textAlign: 'center', lineHeight: 22, maxWidth: 300 },

  // Bottom
  bottomWrap: { paddingHorizontal: 32, paddingBottom: 32 },
  dotsRow:    { flexDirection: 'row', justifyContent: 'center', gap: 8, marginBottom: 16 },
  dot:        { width: 8, height: 8, borderRadius: 4, backgroundColor: '#1A2E1C' },
  dotActive:  { backgroundColor: GOLD, width: 20, borderRadius: 4 },

  // CTA (final page only)
  ctaBtn:  { backgroundColor: GOLD, borderRadius: 14, paddingVertical: 17, alignItems: 'center', width: '100%' },
  ctaText: { fontSize: 13, fontWeight: '700', color: BG, letterSpacing: 1.5 },
});
