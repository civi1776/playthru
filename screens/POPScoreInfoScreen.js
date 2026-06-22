import { ScrollView, View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import VerificationBadge from '../components/VerificationBadge';

const TIERS = [
  { range: '4.5 – 5.0', label: 'Elite Pacer',       color: '#C9A84C', bg: 'rgba(201,168,76,0.12)',  border: 'rgba(201,168,76,0.35)' },
  { range: '4.0 – 4.4', label: 'Fast Golfer',        color: '#7DC87A', bg: 'rgba(125,200,122,0.1)',  border: 'rgba(125,200,122,0.3)' },
  { range: '3.0 – 3.9', label: 'Average Pace',       color: '#D4B86A', bg: 'rgba(212,184,106,0.1)',  border: 'rgba(212,184,106,0.3)' },
  { range: 'Below 3.0', label: 'Needs Improvement',  color: '#C07A6A', bg: 'rgba(192,122,106,0.1)',  border: 'rgba(192,122,106,0.3)' },
];

const INPUTS = [
  { n: '1', title: 'Holes played',      desc: '9 or 18 holes sets the expected baseline time for your round.' },
  { n: '2', title: 'Transport',         desc: 'Cart rounds have a shorter baseline than walking rounds.' },
  { n: '3', title: 'Group size',        desc: 'Larger groups get more expected time built into the calculation.' },
  { n: '4', title: 'Pace delay',        desc: 'If you were held up by another group, that time is forgiven.' },
  { n: '5', title: 'Score vs handicap', desc: 'Playing well rewards a small bonus to your score.' },
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
          <Text style={s.heroSub}>On The Clock Score</Text>
        </View>

        {/* Section 1 — What is it */}
        <View style={s.section}>
          <Text style={s.sectionTitle}>What is an Clocked Score?</Text>
          <Text style={s.body}>
            Your Clocked Score is a number from 0.0 to 5.0 powered by an AI algorithm that measures how efficiently you play golf. The higher your score, the faster you play relative to the expected time for your specific round conditions. Clocked's AI calculates your score automatically every time you log a round, factoring in multiple inputs to give you the most accurate pace rating in golf.
          </Text>
        </View>

        {/* Section 2 — The scale */}
        <View style={s.section}>
          <Text style={s.sectionTitle}>The scale</Text>
          <View style={s.tierList}>
            {TIERS.map(t => (
              <View key={t.label} style={[s.tierCard, { backgroundColor: t.bg, borderColor: t.border }]}>
                <View style={s.tierLeft}>
                  <Text style={[s.tierRange, { color: t.color }]}>{t.range}</Text>
                  <Text style={[s.tierLabel, { color: t.color }]}>{t.label}</Text>
                </View>
                <View style={[s.tierDot, { backgroundColor: t.color }]} />
              </View>
            ))}
          </View>
        </View>

        {/* Section 3 — How it's calculated */}
        <View style={s.section}>
          <Text style={s.sectionTitle}>How our AI calculates your score</Text>
          <Text style={[s.body, { marginBottom: 16 }]}>
            Clocked's AI weighs five key inputs from every round you log and combines them into a single precise score. No two rounds are scored the same way — the algorithm adapts to your specific conditions every time:
          </Text>
          <View style={s.inputList}>
            {INPUTS.map(item => (
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

        {/* Section 4 — Initial score */}
        <View style={s.section}>
          <Text style={s.sectionTitle}>Your initial score</Text>
          <Text style={s.body}>
            When you first joined Clocked, our AI set your initial Clocked Score based on your typical round time. As you log more rounds, the AI continuously learns from your real on-course performance and refines your score to be more accurate over time. The more you log, the smarter it gets.
          </Text>
        </View>

        {/* Section 5 — Verification levels */}
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
              <VerificationBadge level="caddy_corroborated" />
              <Text style={s.verifyDesc}>Caddy verified — a caddy on Clocked confirmed your round times.</Text>
            </View>
            <View style={s.verifyRow}>
              <VerificationBadge level="gps_tracked" />
              <Text style={s.verifyDesc}>GPS tracked — automatic scoring via real-time GPS. Coming soon.</Text>
            </View>
          </View>
        </View>

        {/* Footer */}
        <Text style={s.footer}>
          Clocked uses leading-edge AI to deliver the most accurate pace of play score in golf.
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
  tierCard:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderRadius: 14, borderWidth: 1, paddingVertical: 14, paddingHorizontal: 16 },
  tierLeft:     { gap: 3 },
  tierRange:    { fontSize: 12, fontWeight: '700', letterSpacing: 1 },
  tierLabel:    { fontSize: 16, fontWeight: '300' },
  tierDot:      { width: 10, height: 10, borderRadius: 5 },

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
