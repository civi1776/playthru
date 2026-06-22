// ─── Rules — the conversion engine ───────────────────────────────────────────
// Pitch-first, skimmable, 60-second read. Not a legal doc — a reason to play.

import { View, Text, ScrollView, TouchableOpacity, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

// ─── Scoring table data ──────────────────────────────────────────────────────
const SCORING_ROWS = [
  { result: 'Albatross',            pts: '+9', color: '#C9A84C' },
  { result: 'Eagle',                pts: '+6', color: '#C9A84C' },
  { result: 'Birdie',               pts: '+3', color: '#7DC87A' },
  { result: 'Par',                  pts: '+1', color: '#F5EDD8' },
  { result: 'Bogey',                pts: '0',  color: '#B8A882' },
  { result: 'Double bogey or worse', pts: '\u22122', color: '#E85D4A' },
];

// ─── Section heading ─────────────────────────────────────────────────────────
function SectionHead({ icon, title }) {
  return (
    <View style={s.sectionHead}>
      <View style={s.sectionDot}>
        <Ionicons name={icon} size={16} color="#C9A84C" />
      </View>
      <Text style={s.sectionTitle}>{title}</Text>
    </View>
  );
}

// ─── Bullet ──────────────────────────────────────────────────────────────────
function Bullet({ children }) {
  return (
    <View style={s.bulletRow}>
      <View style={s.bulletDot} />
      <Text style={s.bulletText}>{children}</Text>
    </View>
  );
}

// ─── Main Screen ─────────────────────────────────────────────────────────────
export default function RulesScreen({ navigation }) {
  const playCTA = () => {
    const root = navigation.getParent();
    if (root) root.navigate('ClockedSetup');
    else navigation.navigate('ClockedSetup');
  };

  return (
    <SafeAreaView style={s.container}>
      {/* Tab header */}
      <View style={s.tabHeader}>
        <Text style={s.tabHeaderText}>The On-the-Clock Rules</Text>
      </View>

      <ScrollView contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>

        {/* ── 1. The hook ── */}
        <View style={s.hookBlock}>
          <Text style={s.hookHeadline}>Golf has a clock now.</Text>
          <Text style={s.hookSub}>
            A faster game you can play on any course.{'\n'}Same clubs, same fairways — the clock is part of the score.
          </Text>
        </View>

        {/* ── 2. Why it exists ── */}
        <View style={s.whyBlock}>
          <Text style={s.whyText}>
            A round takes too long. We're not speeding up golf — we built a new game on top of it, where pace is a skill instead of a complaint.
          </Text>
        </View>

        {/* ── 3. How it works ── */}

        {/* The Format */}
        <SectionHead icon="people-outline" title="The Format" />
        <View style={s.card}>
          <Bullet>9 holes, teams of 2.</Bullet>
          <Bullet>You each play your own ball — your points add up to one team score.</Bullet>
          <Bullet>Your score is your strokes against par — no handicap math. The clock is the equalizer.</Bullet>
        </View>

        {/* The Shot Clock */}
        <SectionHead icon="timer-outline" title="The Shot Clock" />
        <View style={s.card}>
          <Bullet>Every hole has a time par, set by its length and par.</Bullet>
          <Bullet>The clock counts down from there. Beat it.</Bullet>
          <Bullet>Run over and it costs your team points. No grace window, no excuses.</Bullet>
        </View>

        {/* Scoring */}
        <SectionHead icon="flash-outline" title="Scoring — Modified Stableford" />
        <View style={s.card}>
          <Text style={s.cardIntro}>Points per player, per hole:</Text>

          {/* Scoring table */}
          <View style={s.tableWrap}>
            <View style={s.tableHeaderRow}>
              <Text style={[s.tableHeaderCell, { flex: 1 }]}>RESULT</Text>
              <Text style={[s.tableHeaderCell, { width: 56, textAlign: 'right' }]}>PTS</Text>
            </View>
            {SCORING_ROWS.map((row, i) => (
              <View key={i} style={[s.tableRow, i === SCORING_ROWS.length - 1 && s.tableRowLast]}>
                <Text style={[s.tableResult, { flex: 1 }]}>{row.result}</Text>
                <Text style={[s.tablePts, { color: row.color }]}>{row.pts}</Text>
              </View>
            ))}
            <View style={s.tableFootnote}>
              <Text style={s.footnoteText}>Double or worse = pick up. Don't grind out an 8.</Text>
            </View>
          </View>

          <View style={s.penaltyBlock}>
            <Text style={s.penaltyLine}>Team hole score = both players' points {'\u2212'} time penalty.</Text>
            <Text style={s.penaltyLine}>Time penalty: {'\u22120.5'} pts for every 30s over time par, up to {'\u22123'}.</Text>
            <Text style={s.penaltyEmphasis}>Scores can go negative. That's the point.</Text>
          </View>
        </View>

        {/* Rules that keep it moving */}
        <SectionHead icon="flag-outline" title="Rules That Keep It Moving" />
        <View style={s.card}>
          <View style={s.ruleItem}>
            <Text style={s.ruleLabel}>3-PUTT MAX</Text>
            <Text style={s.ruleBody}>After three putts it's holed. Pick up.</Text>
          </View>
          <View style={s.ruleDivider} />
          <View style={s.ruleItem}>
            <Text style={s.ruleLabel}>TROUBLE IS SIMPLE</Text>
            <Text style={s.ruleBody}>Water, OB, lost, unplayable — all the same. One penalty stroke, drop within two club-lengths, play on. You never walk back to re-hit.</Text>
          </View>
          <View style={s.ruleDivider} />
          <View style={s.ruleItem}>
            <Text style={s.ruleLabel}>IMPROVE YOUR LIE</Text>
            <Text style={s.ruleBody}>Move the ball one club-length. No relocating to a different spot.</Text>
          </View>
          <View style={s.ruleDivider} />
          <View style={s.ruleItem}>
            <Text style={s.ruleLabel}>READY GOLF</Text>
            <Text style={s.ruleBody}>Whoever's ready, hits. Always.</Text>
          </View>
        </View>

        {/* ── 4. CTA ── */}
        <View style={s.ctaBlock}>
          <TouchableOpacity style={s.ctaBtn} onPress={playCTA} activeOpacity={0.85}>
            <Ionicons name="timer-outline" size={20} color="#090F0A" />
            <Text style={s.ctaBtnTxt}>PLAY ON THE CLOCK</Text>
          </TouchableOpacity>
          <Text style={s.ctaSub}>Grab a partner. Start the clock.</Text>
        </View>

      </ScrollView>
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const GOLD  = '#C9A84C';
const CREAM = '#F5EDD8';
const MUTED = '#B8A882';
const DIM   = '#7A6E58';
const BG    = '#090F0A';
const CARD  = '#0D1A0F';
const BORDER = '#7DC87A22';

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: BG },
  tabHeader:     { paddingHorizontal: 20, paddingTop: 14, paddingBottom: 10 },
  tabHeaderText: { fontSize: 13, fontWeight: '700', color: GOLD, letterSpacing: 3 },
  content:   { paddingBottom: 40 },

  // 1. Hook
  hookBlock:    { alignItems: 'center', paddingHorizontal: 24, paddingTop: 32, paddingBottom: 24 },
  hookHeadline: { fontSize: 28, fontWeight: '700', color: CREAM, textAlign: 'center', letterSpacing: -0.5, marginBottom: 12 },
  hookSub:      { fontSize: 15, color: MUTED, textAlign: 'center', lineHeight: 22 },

  // 2. Why
  whyBlock:     { paddingHorizontal: 24, paddingBottom: 28 },
  whyText:      { fontSize: 15, color: MUTED, lineHeight: 23, textAlign: 'center', fontStyle: 'italic' },

  // Section headings
  sectionHead:  { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 20, marginTop: 8, marginBottom: 10 },
  sectionDot:   { width: 28, height: 28, borderRadius: 8, backgroundColor: '#1A2E1C', alignItems: 'center', justifyContent: 'center' },
  sectionTitle: { fontSize: 14, fontWeight: '700', color: GOLD, letterSpacing: 2, textTransform: 'uppercase' },

  // Cards
  card:       { marginHorizontal: 16, backgroundColor: CARD, borderRadius: 14, borderWidth: 1, borderColor: BORDER, padding: 16, marginBottom: 16 },
  cardIntro:  { fontSize: 13, color: MUTED, marginBottom: 12 },

  // Bullets
  bulletRow:  { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 8 },
  bulletDot:  { width: 5, height: 5, borderRadius: 2.5, backgroundColor: GOLD, marginTop: 6 },
  bulletText: { flex: 1, fontSize: 14, color: CREAM, lineHeight: 20 },

  // Scoring table
  tableWrap:      { backgroundColor: BG, borderRadius: 10, borderWidth: 1, borderColor: GOLD + '33', overflow: 'hidden', marginBottom: 14 },
  tableHeaderRow: { flexDirection: 'row', paddingHorizontal: 14, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: GOLD + '22' },
  tableHeaderCell:{ fontSize: 9, fontWeight: '700', color: DIM, letterSpacing: 2 },
  tableRow:       { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#7DC87A0D' },
  tableRowLast:   { borderBottomWidth: 0 },
  tableResult:    { fontSize: 14, color: CREAM, fontWeight: '500' },
  tablePts:       { width: 56, fontSize: 16, fontWeight: '700', textAlign: 'right', fontVariant: ['tabular-nums'] },
  tableFootnote:  { paddingHorizontal: 14, paddingVertical: 8, backgroundColor: '#E85D4A0A', borderTopWidth: 1, borderTopColor: '#E85D4A22' },
  footnoteText:   { fontSize: 11, color: '#E85D4A', fontStyle: 'italic' },

  // Penalty block
  penaltyBlock:    { gap: 6 },
  penaltyLine:     { fontSize: 13, color: MUTED, lineHeight: 19 },
  penaltyEmphasis: { fontSize: 14, fontWeight: '700', color: CREAM, marginTop: 4 },

  // Rules list
  ruleItem:    { paddingVertical: 4 },
  ruleLabel:   { fontSize: 10, fontWeight: '700', color: GOLD, letterSpacing: 2, marginBottom: 4 },
  ruleBody:    { fontSize: 13, color: CREAM, lineHeight: 19 },
  ruleDivider: { height: 1, backgroundColor: BORDER, marginVertical: 10 },

  // CTA
  ctaBlock:   { alignItems: 'center', paddingVertical: 36, paddingHorizontal: 20 },
  ctaBtn:     { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: GOLD, borderRadius: 16, paddingVertical: 18, paddingHorizontal: 36 },
  ctaBtnTxt:  { fontSize: 13, fontWeight: '700', color: BG, letterSpacing: 2 },
  ctaSub:     { fontSize: 12, color: DIM, marginTop: 10, fontStyle: 'italic' },
});
