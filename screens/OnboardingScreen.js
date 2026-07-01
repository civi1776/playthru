// ─── OnboardingScreen — 5-step intro for new users ───────────────────────────
import { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Dimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';

const { width: SW } = Dimensions.get('window');

const GOLD  = '#C9A84C';
const CREAM = '#F5EDD8';
const MUTED = '#B8A882';
const DIM   = '#7A6E58';
const BG    = '#090F0A';
const GREEN = '#7DC87A';
const RED   = '#E85D4A';

const SCORING_TABLE = [
  { result: 'Albatross', pts: '+9', color: GOLD },
  { result: 'Eagle',     pts: '+6', color: GOLD },
  { result: 'Birdie',    pts: '+3', color: GREEN },
  { result: 'Par',       pts: '+1', color: CREAM },
  { result: 'Bogey',     pts: '0',  color: MUTED },
  { result: 'Double+',   pts: '\u22122', color: RED },
];

const STEPS = [
  {
    icon: 'timer-outline',
    headline: 'Every hole has a shot clock.',
    body: 'A time par is set for each hole based on its distance and par. The clock starts when you tee off.',
  },
  {
    icon: null, // scoring table rendered separately
    headline: 'Points per hole. Simple.',
    body: 'Birdies earn points. Bogeys cost nothing. Double bogey or worse: pick up and move on.',
  },
  {
    icon: 'people-outline',
    headline: 'Solo or with a team.',
    body: 'Play 9 or 18 holes. Solo or with up to 4 others. Everyone plays their own ball — your points combine into one team score.',
  },
  {
    icon: null, // score number rendered separately
    headline: 'Build your Clocked Score.',
    body: 'Every round updates your 0\u2013100 rating. Play more, rank higher. Compete against golfers nationwide.',
  },
  {
    icon: null, // final step has different CTA
    headline: "You're on the clock.",
    body: 'Tap Play to start your first round. The clock starts when you\'re ready.',
  },
];

export default function OnboardingScreen({ navigation }) {
  const [step, setStep] = useState(0);
  const current = STEPS[step];
  const isFinal = step === STEPS.length - 1;

  const advance = async () => {
    if (isFinal) {
      await AsyncStorage.setItem('onboarding_complete', 'true');
      navigation.reset({ index: 0, routes: [{ name: 'Main' }] });
    } else {
      setStep(s => s + 1);
    }
  };

  return (
    <SafeAreaView style={s.container}>
      {/* Step dots */}
      <View style={s.dotsRow}>
        {STEPS.map((_, i) => (
          <View key={i} style={[s.dot, i === step && s.dotActive, i < step && s.dotDone]} />
        ))}
      </View>

      {/* Content */}
      <View style={s.content}>
        {/* Step 0: Clock icon */}
        {step === 0 && (
          <View style={s.iconWrap}>
            <Ionicons name="timer-outline" size={80} color={GOLD} />
          </View>
        )}

        {/* Step 1: Scoring table */}
        {step === 1 && (
          <View style={s.tableWrap}>
            {SCORING_TABLE.map((row, i) => (
              <View key={i} style={s.tableRow}>
                <Text style={[s.tableResult, { color: row.color }]}>{row.result}</Text>
                <Text style={[s.tablePts, { color: row.color }]}>{row.pts}</Text>
              </View>
            ))}
          </View>
        )}

        {/* Step 2: People icon */}
        {step === 2 && (
          <View style={s.iconWrap}>
            <Ionicons name="people-outline" size={80} color={GOLD} />
          </View>
        )}

        {/* Step 3: Score number */}
        {step === 3 && (
          <View style={s.iconWrap}>
            <Text style={s.demoScore}>72</Text>
            <Text style={s.demoScoreMax}>/100</Text>
          </View>
        )}

        {/* Step 4: Play button visual */}
        {step === 4 && (
          <View style={s.iconWrap}>
            <View style={s.playCircle}>
              <Ionicons name="timer-outline" size={40} color={BG} />
            </View>
          </View>
        )}

        <Text style={s.headline}>{current.headline}</Text>
        <Text style={s.body}>{current.body}</Text>
      </View>

      {/* CTA */}
      <View style={s.ctaWrap}>
        <TouchableOpacity
          style={[s.ctaBtn, isFinal && s.ctaBtnFinal]}
          onPress={advance}
          activeOpacity={0.85}
        >
          <Text style={[s.ctaText, isFinal && s.ctaTextFinal]}>
            {isFinal ? 'PLAY MY FIRST ROUND' : 'Got it \u2192'}
          </Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: BG },

  dotsRow:   { flexDirection: 'row', justifyContent: 'center', gap: 6, paddingTop: 16, paddingBottom: 8 },
  dot:       { width: 6, height: 6, borderRadius: 3, backgroundColor: '#1A2E1C' },
  dotActive: { backgroundColor: GOLD, width: 18, borderRadius: 3 },
  dotDone:   { backgroundColor: '#4A7A50' },

  content:   { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 },

  iconWrap:  { marginBottom: 28, alignItems: 'center', flexDirection: 'row' },

  headline:  { fontSize: 26, fontWeight: '600', color: CREAM, textAlign: 'center', marginBottom: 14, letterSpacing: -0.3 },
  body:      { fontSize: 15, color: MUTED, textAlign: 'center', lineHeight: 22, maxWidth: 300 },

  // Scoring table
  tableWrap: { marginBottom: 28, width: 200 },
  tableRow:  { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: '#7DC87A0D' },
  tableResult: { fontSize: 14, fontWeight: '500' },
  tablePts:    { fontSize: 16, fontWeight: '700', fontVariant: ['tabular-nums'] },

  // Demo score
  demoScore:    { fontSize: 64, fontWeight: '200', color: GOLD, fontVariant: ['tabular-nums'] },
  demoScoreMax: { fontSize: 22, fontWeight: '300', color: DIM, marginLeft: 4 },

  // Play circle
  playCircle: { width: 80, height: 80, borderRadius: 40, backgroundColor: GOLD, alignItems: 'center', justifyContent: 'center' },

  // CTA
  ctaWrap:     { paddingHorizontal: 32, paddingBottom: 32 },
  ctaBtn:      { borderWidth: 1, borderColor: GOLD, borderRadius: 12, paddingVertical: 14, paddingHorizontal: 32, alignItems: 'center' },
  ctaBtnFinal: { backgroundColor: GOLD, borderColor: GOLD },
  ctaText:     { fontSize: 14, fontWeight: '700', color: GOLD, letterSpacing: 1 },
  ctaTextFinal:{ color: BG },
});
