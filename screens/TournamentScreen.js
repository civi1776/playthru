// ─── Tournament — Clocked Golf Tournament Series info page ───────────────────
// In-app landing page for the national tournament series. CTA leads to
// TournamentApplyScreen where users submit an interest application.
import { ScrollView, View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { COLOR, SPACING, RADIUS } from '../lib/theme';

const WHO_LIST = [
  'Competitive golfers',
  'Former athletes',
  'Club champions',
  'College players',
  'High-level amateurs',
  'People who compete',
];

const FORMAT_ITEMS = [
  { label: 'TEAMS', value: 'Two-player teams competing together' },
  { label: 'HOLES', value: 'Nine holes. Shotgun start.' },
  { label: 'SHOT CLOCK', value: 'Visible on every hole. Real consequences for slow play.' },
  { label: 'SCORING', value: 'Live scoring tracked through Clocked Golf.', highlight: true },
];

const EXPERIENCE_ITEMS = [
  { value: 'Premium', label: 'HAND-PICKED VENUES, CITY BY CITY' },
  { value: 'Curated', label: 'FIELD OF ATHLETES AND COMPETITORS' },
  { value: 'Covered', label: 'PROFESSIONAL CONTENT AND LIVE COVERAGE' },
];

export default function TournamentScreen({ navigation }) {
  return (
    <SafeAreaView style={s.container}>
      <TouchableOpacity style={s.backBtn} onPress={() => navigation.goBack()} activeOpacity={0.7}>
        <Ionicons name="chevron-back" size={20} color={COLOR.gold} />
        <Text style={s.backText}>BACK</Text>
      </TouchableOpacity>

      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>

        {/* Hero */}
        <View style={s.hero}>
          <Text style={s.overline}>NATIONWIDE {'\u00B7'} SERIES APPLICATIONS OPEN</Text>
          <Text style={s.heroTitle}>The Clocked Golf</Text>
          <Text style={s.heroSub}>Tournament Series</Text>
          <View style={s.heroDivider} />
          <Text style={s.heroStatement}>
            The first competitive golf format built around{' '}
            <Text style={s.heroStatementStrong}>pace, pressure, and performance.</Text>
          </Text>

          <View style={s.metaRow}>
            <View style={s.metaItem}>
              <Text style={s.metaLabel}>SERIES</Text>
              <Text style={s.metaValue}>Multiple cities. 2026 and beyond.</Text>
            </View>
          </View>
          <View style={s.metaRow}>
            <View style={s.metaItem}>
              <Text style={s.metaLabel}>FORMAT</Text>
              <Text style={s.metaValue}>Two-Player Teams {'\u00B7'} 9 Holes</Text>
            </View>
            <View style={s.metaItem}>
              <Text style={s.metaLabel}>FIELD</Text>
              <Text style={s.metaValue}>By Application Only</Text>
            </View>
          </View>
        </View>

        {/* Declaration */}
        <View style={s.section}>
          <Text style={s.eyebrow}>A NEW KIND OF COMPETITION</Text>
          <Text style={s.declarationLine}>Golf has never had a shot clock.</Text>
          <Text style={[s.declarationLine, s.accent]}>Until now.</Text>
          <Text style={s.body}>
            The Clocked Golf Tournament Series is the foundation of a national competitive circuit built around pace, pressure, and performance. Two-player teams. A visible shot clock on every hole. Live scoring. Real consequences for slow play.{'\n\n'}
            This format makes golf feel like an athletic team sport — not a solitary leisure activity. Every shot carries consequence. Every decision matters.
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

        {/* Who */}
        <View style={s.section}>
          <Text style={s.eyebrow}>WHO WE'RE LOOKING FOR</Text>
          <Text style={s.sectionTitle}>People who embrace pressure rather than avoid it.</Text>
          <Text style={[s.body, { marginBottom: 16 }]}>
            Each tournament field is intentionally limited. We are selecting competitors who represent the future of the game.
          </Text>
          <View style={s.whoList}>
            {WHO_LIST.map(item => (
              <View key={item} style={s.whoItem}>
                <Text style={s.whoItemText}>{item}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* Why */}
        <View style={s.section}>
          <Text style={s.eyebrow}>WHY COMPETE</Text>
          <Text style={s.sectionTitle}>Be a founding member of the competitive circuit.</Text>
          <View style={s.pullQuote}>
            <Text style={s.pullQuoteText}>"Early applicants get first consideration as tournaments are announced city by city."</Text>
          </View>
          <Text style={s.body}>
            This is the beginning of something new. The players who step up now become the founding competitors of the Clocked Golf circuit — the first names on the first leaderboards, in the first cities.
          </Text>
        </View>

        {/* Experience */}
        <View style={s.section}>
          <Text style={s.eyebrow}>THE EXPERIENCE</Text>
          <Text style={s.sectionTitle}>Unlike anything currently offered in golf.</Text>
          <View style={s.expGrid}>
            {EXPERIENCE_ITEMS.map(item => (
              <View key={item.label} style={s.expItem}>
                <Text style={s.expItemValue}>{item.value}</Text>
                <Text style={s.expItemLabel}>{item.label}</Text>
              </View>
            ))}
          </View>
          <Text style={[s.body, { marginTop: 16 }]}>
            Exclusive merchandise. Awards presentation. A competitive atmosphere built for athletes — built for people who believe golf can evolve.
          </Text>
        </View>

        {/* Apply CTA */}
        <View style={s.applySection}>
          <Text style={s.eyebrow}>APPLY TO COMPETE</Text>
          <Text style={s.sectionTitle}>Interest applications are now open.</Text>
          <Text style={s.body}>
            Submit your application to be considered for tournaments as they are announced in your area. Field sizes are limited — not all applicants will be accepted. If you believe golf should be played with urgency, intention, and competitive spirit — we want to hear from you.
          </Text>
          <TouchableOpacity
            style={s.applyBtn}
            onPress={() => navigation.navigate('TournamentApply')}
            activeOpacity={0.85}
          >
            <Text style={s.applyBtnText}>APPLY TO COMPETE {'\u2192'}</Text>
          </TouchableOpacity>
          <Text style={s.closing}>Welcome to golf on the clock.</Text>
        </View>

      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container:    { flex: 1, backgroundColor: COLOR.bg },
  backBtn:      { flexDirection: 'row', alignItems: 'center', paddingHorizontal: SPACING.lg, paddingVertical: SPACING.md, gap: SPACING.xs },
  backText:     { fontSize: 10, fontWeight: '700', color: COLOR.gold, letterSpacing: 2 },
  scroll:       { paddingHorizontal: SPACING.lg, paddingBottom: 60 },

  hero:             { paddingVertical: 24, borderBottomWidth: 1, borderBottomColor: COLOR.border, marginBottom: 28 },
  overline:         { fontSize: 10, fontWeight: '700', color: COLOR.gold, letterSpacing: 3, marginBottom: 20 },
  heroTitle:        { fontSize: 40, fontFamily: 'Georgia', fontWeight: '300', color: COLOR.cream, lineHeight: 44 },
  heroSub:          { fontSize: 20, fontStyle: 'italic', fontWeight: '300', color: COLOR.gold, marginBottom: 20, fontFamily: 'Georgia' },
  heroDivider:      { width: 40, height: 1, backgroundColor: COLOR.gold + '66', marginBottom: 20 },
  heroStatement:    { fontSize: 16, color: COLOR.muted, lineHeight: 26, marginBottom: 24 },
  heroStatementStrong: { color: COLOR.cream },
  metaRow:          { flexDirection: 'row', gap: 24, marginBottom: 14 },
  metaItem:         { flex: 1 },
  metaLabel:        { fontSize: 9, fontWeight: '700', color: COLOR.dim, letterSpacing: 2, marginBottom: 4 },
  metaValue:        { fontSize: 14, color: COLOR.cream },

  section:          { marginBottom: 32 },
  eyebrow:          { fontSize: 10, fontWeight: '700', color: COLOR.gold, letterSpacing: 3, marginBottom: 14 },
  sectionTitle:     { fontSize: 21, fontFamily: 'Georgia', fontWeight: '300', color: COLOR.cream, lineHeight: 27, marginBottom: 14 },
  declarationLine:  { fontSize: 19, fontFamily: 'Georgia', fontWeight: '300', color: COLOR.cream, lineHeight: 25, marginBottom: 2 },
  accent:           { color: COLOR.gold, fontStyle: 'italic' },
  body:             { fontSize: 14, color: COLOR.muted, lineHeight: 23 },

  formatGrid:       { gap: 8 },
  formatItem:       { backgroundColor: COLOR.surface, borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLOR.border, padding: SPACING.lg },
  formatItemHighlight: { backgroundColor: 'rgba(125,200,122,0.08)', borderColor: COLOR.borderGold },
  formatItemLabel:  { fontSize: 9, fontWeight: '700', color: COLOR.dim, letterSpacing: 2, marginBottom: 8 },
  formatItemValue:  { fontSize: 14, color: COLOR.cream, lineHeight: 20 },

  whoList:          { gap: 0 },
  whoItem:          { paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: COLOR.border },
  whoItemText:      { fontSize: 16, fontWeight: '300', color: COLOR.cream },

  pullQuote:        { borderLeftWidth: 2, borderLeftColor: COLOR.gold, paddingLeft: SPACING.lg, paddingVertical: 4, marginBottom: SPACING.lg },
  pullQuoteText:    { fontSize: 16, color: COLOR.gold, fontStyle: 'italic', lineHeight: 24 },

  expGrid:          { flexDirection: 'row', gap: 8 },
  expItem:          { flex: 1, backgroundColor: COLOR.surface, borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLOR.border, padding: SPACING.md, alignItems: 'center' },
  expItemValue:     { fontSize: 16, fontWeight: '300', color: COLOR.gold, marginBottom: 8, fontFamily: 'Georgia' },
  expItemLabel:     { fontSize: 9, color: COLOR.dim, letterSpacing: 1, textAlign: 'center', lineHeight: 14 },

  applySection:     { backgroundColor: COLOR.surface, borderRadius: RADIUS.lg, borderWidth: 1, borderColor: COLOR.borderGold, padding: SPACING.xl, marginBottom: SPACING.lg },
  applyBtn:         { borderWidth: 1, borderColor: COLOR.gold, borderRadius: RADIUS.lg, paddingVertical: SPACING.lg, alignItems: 'center', marginTop: SPACING.lg, marginBottom: SPACING.lg },
  applyBtnText:     { fontSize: 12, fontWeight: '700', color: COLOR.gold, letterSpacing: 2 },
  closing:          { fontSize: 15, color: COLOR.cream, fontStyle: 'italic', textAlign: 'center', borderTopWidth: 1, borderTopColor: COLOR.border, paddingTop: SPACING.lg },
});
