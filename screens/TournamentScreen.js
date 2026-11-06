// ─── Tournament — Clocked at the Par 3, 19 Nov 2026 ─────────────────────────
// In-app event page. Mirrors clocked.golf/tournaments. Every fact comes from
// lib/event.js. CTA leads to TournamentApplyScreen.
import { ScrollView, View, Text, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { COLOR, SPACING, RADIUS } from '../lib/theme';
import ScreenHeader from '../components/ScreenHeader';
import Button from '../components/Button';
import { EVENT, EVENT_ENTRY_NOTE, EVENT_TEST_RUN_NOTE } from '../lib/event';

const FACTS = [
  { label: 'WHEN',  value: `${EVENT.dateLabel} · ${EVENT.timeLabel}` },
  { label: 'WHERE', value: `${EVENT.venue} · ${EVENT.city}` },
  { label: 'FIELD', value: `${EVENT.teamCap} of two · hand-picked` },
  { label: 'ENTRY', value: `${EVENT.entryLabel} · ${EVENT.paymentLabel}` },
];

const FORMAT_ITEMS = [
  { label: 'FORMAT',     value: 'Clocked Golf. A time par on every hole, points for every score.' },
  { label: 'TEAMS',      value: 'Two-player teams. Apply together.' },
  { label: 'SHOT CLOCK', value: 'Starts on the first shot of the hole, stops when the last player holes out. Over time par costs points.' },
  { label: 'SCORING',    value: 'Scored in the Clocked Golf app, the same way every round is.', highlight: true },
];

const HOW_IT_WORKS = [
  { n: '1', title: 'Apply with your partner', body: 'One application per team. Tell us who you both are and what you played.' },
  { n: '2', title: 'We pick the field',         body: `We read every application and hand-pick ${EVENT.teamCap}. Everyone else goes on the waitlist, in order.` },
  { n: '3', title: 'Pay to lock your spot',     body: EVENT_ENTRY_NOTE },
  { n: '4', title: 'Play on the clock',         body: `Nine holes at ${EVENT.venue}. The cash prize is set by the size of the field and announced before the first tee.` },
];

export default function TournamentScreen({ navigation }) {
  return (
    <SafeAreaView style={s.container}>
      <ScreenHeader title="FIRST EVENT" onBack={() => navigation.goBack()} borderless />

      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>

        {/* Hero */}
        <View style={s.hero}>
          <Text style={s.overline}>THE FIRST CLOCKED EVENT {'·'} APPLICATIONS OPEN</Text>
          <Text style={s.heroTitle}>Clocked at</Text>
          <Text style={s.heroSub}>the Par 3.</Text>
          <View style={s.heroDivider} />
          <Text style={s.heroStatement}>
            {EVENT.dateLabel}, {EVENT.timeLabel}, {EVENT.venue}.{' '}
            <Text style={s.heroStatementStrong}>Two-player teams, a shot clock on every hole, and a cash prize.</Text>
          </Text>

          <View style={s.factGrid}>
            {FACTS.map(f => (
              <View key={f.label} style={s.factItem}>
                <Text style={s.metaLabel}>{f.label}</Text>
                <Text style={s.metaValue}>{f.value}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* Test run */}
        <View style={s.section}>
          <Text style={s.eyebrow}>WHAT THIS IS</Text>
          <Text style={s.sectionTitle}>A test run, played for real.</Text>
          <Text style={s.body}>{EVENT_TEST_RUN_NOTE}</Text>
          <View style={s.pullQuote}>
            <Text style={s.pullQuoteText}>"We want to know what it feels like to play golf against a clock. You'll be the ones to tell us."</Text>
          </View>
          <Text style={s.body}>
            Tour pros, top amateurs and athletes from other sports are already in. The field is small on purpose so every team gets a real read on the format.
          </Text>
        </View>

        {/* How it works */}
        <View style={s.section}>
          <Text style={s.eyebrow}>HOW IT WORKS</Text>
          {HOW_IT_WORKS.map(step => (
            <View key={step.n} style={s.step}>
              <Text style={s.stepN}>{step.n}</Text>
              <View style={{ flex: 1 }}>
                <Text style={s.stepTitle}>{step.title}</Text>
                <Text style={s.stepBody}>{step.body}</Text>
              </View>
            </View>
          ))}
        </View>

        {/* Prize + selection */}
        <View style={s.section}>
          <Text style={s.eyebrow}>THE PRIZE</Text>
          <Text style={s.sectionTitle}>Cash. The amount depends on the field.</Text>
          <Text style={s.body}>
            Entries fund the prize, so the purse is set once the field is locked and announced before the first tee. More teams, bigger prize.
          </Text>
        </View>

        <View style={s.section}>
          <Text style={s.eyebrow}>SELECTION & WAITLIST</Text>
          <Text style={s.sectionTitle}>Applying is not entering.</Text>
          <Text style={s.body}>
            We go through every application and hand-pick the teams. If you're not in the first field you go on the waitlist, and when a team drops, the next team on the list gets the call. Nobody pays until they're in.
          </Text>
        </View>

        {/* Format */}
        <View style={s.section}>
          <Text style={s.eyebrow}>THE FORMAT</Text>
          <Text style={s.sectionTitle}>Designed for performance under pressure.</Text>
          <View style={s.formatGrid}>
            {FORMAT_ITEMS.map(item => (
              <View key={item.label} style={[s.formatItem, item.highlight && s.formatItemHighlight]}>
                <Text style={s.formatItemLabel}>{item.label}</Text>
                <Text style={[s.formatItemValue, item.highlight && s.accent]}>{item.value}</Text>
              </View>
            ))}
          </View>
          <Text style={[s.body, { marginTop: 16 }]}>
            The fastest players won't automatically win. The best performers under pressure will.
          </Text>
        </View>

        {/* Apply CTA */}
        <View style={s.applySection}>
          <Text style={s.eyebrow}>APPLY TO PLAY</Text>
          <Text style={s.sectionTitle}>Put your team in for {EVENT.dateLabel.split(', ')[1]}.</Text>
          <Text style={s.body}>
            Takes two minutes. One application per team. We'll be in touch with every applicant, in or on the waitlist.
          </Text>
          <Button label="APPLY WITH YOUR PARTNER" icon="arrow-forward" size="lg" onPress={() => navigation.navigate('TournamentApply')} style={{ marginTop: 8 }} />
          <Text style={s.closing}>The game is yours. The clock is running.</Text>
        </View>

      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container:    { flex: 1, backgroundColor: COLOR.bg },
  scroll:       { paddingHorizontal: SPACING.lg, paddingBottom: 60 },

  hero:             { paddingVertical: 24, borderBottomWidth: 1, borderBottomColor: COLOR.border, marginBottom: 28 },
  overline:         { fontSize: 10, fontWeight: '700', color: COLOR.gold, letterSpacing: 3, marginBottom: 20 },
  heroTitle:        { fontSize: 40, fontWeight: '300', color: COLOR.cream, lineHeight: 44 },
  heroSub:          { fontSize: 20, fontStyle: 'italic', fontWeight: '300', color: COLOR.gold, marginBottom: 20 },
  heroDivider:      { width: 40, height: 1, backgroundColor: COLOR.gold + '66', marginBottom: 20 },
  heroStatement:    { fontSize: 16, color: COLOR.muted, lineHeight: 26, marginBottom: 24 },
  heroStatementStrong: { color: COLOR.cream },
  factGrid:         { flexDirection: 'row', flexWrap: 'wrap', gap: 14 },
  factItem:         { width: '47%' },
  metaLabel:        { fontSize: 9, fontWeight: '700', color: COLOR.dim, letterSpacing: 2, marginBottom: 4 },
  metaValue:        { fontSize: 14, color: COLOR.cream, lineHeight: 20 },

  section:          { marginBottom: 32 },
  eyebrow:          { fontSize: 10, fontWeight: '700', color: COLOR.gold, letterSpacing: 3, marginBottom: 14 },
  sectionTitle:     { fontSize: 21, fontWeight: '300', color: COLOR.cream, lineHeight: 27, marginBottom: 14 },
  accent:           { color: COLOR.gold, fontStyle: 'italic' },
  body:             { fontSize: 14, color: COLOR.muted, lineHeight: 23 },

  step:             { flexDirection: 'row', gap: 14, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: COLOR.border },
  stepN:            { width: 26, height: 26, borderRadius: 13, borderWidth: 1, borderColor: COLOR.borderGold, color: COLOR.gold, fontSize: 12, fontWeight: '700', textAlign: 'center', lineHeight: 24, overflow: 'hidden' },
  stepTitle:        { fontSize: 15, color: COLOR.cream, marginBottom: 4 },
  stepBody:         { fontSize: 13, color: COLOR.muted, lineHeight: 20 },

  formatGrid:       { gap: 8 },
  formatItem:       { backgroundColor: COLOR.surface, borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLOR.border, padding: SPACING.lg },
  formatItemHighlight: { backgroundColor: 'rgba(125,200,122,0.08)', borderColor: COLOR.borderGold },
  formatItemLabel:  { fontSize: 9, fontWeight: '700', color: COLOR.dim, letterSpacing: 2, marginBottom: 8 },
  formatItemValue:  { fontSize: 14, color: COLOR.cream, lineHeight: 20 },

  pullQuote:        { borderLeftWidth: 2, borderLeftColor: COLOR.gold, paddingLeft: SPACING.lg, paddingVertical: 4, marginVertical: SPACING.lg },
  pullQuoteText:    { fontSize: 16, color: COLOR.gold, fontStyle: 'italic', lineHeight: 24 },

  applySection:     { backgroundColor: COLOR.surface, borderRadius: RADIUS.lg, borderWidth: 1, borderColor: COLOR.borderGold, padding: SPACING.xl, marginBottom: SPACING.lg },
  closing:          { fontSize: 15, color: COLOR.cream, fontStyle: 'italic', textAlign: 'center', borderTopWidth: 1, borderTopColor: COLOR.border, paddingTop: SPACING.lg, marginTop: SPACING.lg },
});
