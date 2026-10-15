import { ScrollView, View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import VerificationBadge from '../components/VerificationBadge';

// Mirrors lib/clockedRating.js — keep these in sync with the real formula.
const COMPONENTS = [
  {
    n: '1',
    title: 'SCORING — 65%',
    desc: 'Your average points per hole against par (birdies and pars pull it up, bogeys and worse pull it down), mapped onto a 0–100 scale.',
  },
  {
    n: '2',
    title: 'CLOCK — 35%',
    desc: 'The share of your holes finished under time par. Weighted by difficulty — beating the clock at Pro tier counts full, Beginner tier counts less.',
  },
];

const STAGES = [
  { label: 'Provisional', desc: 'Fewer than 5 clocked rounds logged. You still get a full score — new players start at a neutral baseline around 65 so the rankings are never empty — but it moves fast as real rounds come in.' },
  { label: 'Established', desc: '5 or more clocked rounds. Your score now reflects a rolling window of your last 20 rounds, weighted toward how you actually play and beat the clock.' },
];

export default function POPScoreInfoScreen({ navigation }) {
  return (
    <SafeAreaView style={s.container}>
      {/* Back button */}
      <TouchableOpacity style={s.backBtn} onPress={() => navigation.goBack()} activeOpacity={0.7}>
        <Ionicons name="chevron-back" size={20} color="#C9A84C" />
        <Text style={s.backText}>BACK</Text>
      </TouchableOpacity>

      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>

        {/* Hero header */}
        <View style={s.hero}>
          <Text style={s.heroTitle}>Clocked Score</Text>
          <Text style={s.heroSub}>0 – 100</Text>
        </View>

        {/* Section 1 — What is it */}
        <View style={s.section}>
          <Text style={s.sectionTitle}>What is a Clocked Score?</Text>
          <Text style={s.body}>
            Your Clocked Score is a single number from 0 to 100 that combines how well you score against par with how well you beat the clock. It's calculated fresh every time you finish a round on the clock, and it's the number every ranking on Clocked is built on.
          </Text>
        </View>

        {/* Section 2 — How it's calculated */}
        <View style={s.section}>
          <Text style={[s.sectionTitle]}>How it's calculated</Text>
          <Text style={[s.body, { marginBottom: 16 }]}>
            Two components, weighted together:
          </Text>
          <View style={s.inputList}>
            {COMPONENTS.map(item => (
              <View key={item.n} style={s.inputRow}>
                <View style={s.inputNum}>
                  <Text style={s.inputNumText}>{item.n}</Text>
                </View>
                <View style={s.inputText}>
                  <Text style={s.inputTitle}>{item.title}</Text>
                  <Text style={s.inputDesc}>{item.desc}</Text>
                </View>
              </View>
            ))}
          </View>
        </View>

        {/* Section 3 — Provisional vs established */}
        <View style={s.section}>
          <Text style={s.sectionTitle}>Provisional vs. established</Text>
          <View style={s.tierList}>
            {STAGES.map(stage => (
              <View key={stage.label} style={s.stageCard}>
                <Text style={s.stageLabel}>{stage.label.toUpperCase()}</Text>
                <Text style={s.stageDesc}>{stage.desc}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* Section 4 — Verification levels */}
        <View style={s.section}>
          <Text style={s.sectionTitle}>Round verification</Text>
          <Text style={[s.body, { marginBottom: 16 }]}>
            Every round on Clocked gets a verification badge to indicate how its data was collected. Higher-confidence rounds carry more weight in your score.
          </Text>
          <View style={s.verifyList}>
            <View style={s.verifyRow}>
              <VerificationBadge level="self_reported" />
              <Text style={s.verifyDesc}>Self-reported — you logged the round manually.</Text>
            </View>
            <View style={s.verifyRow}>
              <VerificationBadge level="gps_tracked" />
              <Text style={s.verifyDesc}>GPS tracked — automatic scoring via real-time GPS. Coming soon.</Text>
            </View>
          </View>
        </View>

        {/* Footer */}
        <Text style={s.footer}>
          One score, calculated the same way for every player on every certified course.
        </Text>

      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container:    { flex: 1, backgroundColor: '#090F0A' },
  backBtn:      { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 12, gap: 4 },
  backText:     { fontSize: 10, fontWeight: '700', color: '#C9A84C', letterSpacing: 2 },
  scroll:       { paddingHorizontal: 20, paddingBottom: 60 },

  hero:         { alignItems: 'center', paddingVertical: 28, borderBottomWidth: 1, borderBottomColor: '#7DC87A22', marginBottom: 28 },
  heroTitle:    { fontSize: 48, color: '#C9A84C', fontFamily: 'Georgia', fontWeight: '400', letterSpacing: 1 },
  heroSub:      { fontSize: 14, color: '#B8A882', marginTop: 6, letterSpacing: 1 },

  section:      { marginBottom: 28 },
  sectionTitle: { fontSize: 13, fontWeight: '700', color: '#C9A84C', letterSpacing: 1.5, marginBottom: 12 },
  body:         { fontSize: 15, color: '#C8BFA8', lineHeight: 24 },

  tierList:     { gap: 8 },
  stageCard:    { borderRadius: 14, borderWidth: 1, borderColor: '#7DC87A22', backgroundColor: 'rgba(125,200,122,0.06)', paddingVertical: 14, paddingHorizontal: 16, gap: 6 },
  stageLabel:   { fontSize: 12, fontWeight: '700', color: '#C9A84C', letterSpacing: 1.5 },
  stageDesc:    { fontSize: 13, color: '#C8BFA8', lineHeight: 20 },

  inputList:    { gap: 14 },
  inputRow:     { flexDirection: 'row', gap: 14, alignItems: 'flex-start' },
  inputNum:     { width: 28, height: 28, borderRadius: 14, backgroundColor: '#7DC87A22', borderWidth: 1, borderColor: '#7DC87A44', alignItems: 'center', justifyContent: 'center', marginTop: 1 },
  inputNumText: { fontSize: 11, fontWeight: '700', color: '#C9A84C' },
  inputText:    { flex: 1 },
  inputTitle:   { fontSize: 14, fontWeight: '600', color: '#F5EDD8', marginBottom: 3 },
  inputDesc:    { fontSize: 13, color: '#7A6E58', lineHeight: 20 },

  footer:       { fontSize: 12, color: '#7A6E58', fontStyle: 'italic', textAlign: 'center', marginTop: 8, lineHeight: 18 },

  verifyList:   { gap: 12 },
  verifyRow:    { flexDirection: 'row', alignItems: 'center', gap: 12 },
  verifyDesc:   { flex: 1, fontSize: 13, color: '#7A6E58', lineHeight: 19 },
});
