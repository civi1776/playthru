// ─── Tournament — the first Clocked event (South Florida) ───────────────────
// In-app landing page. Mirrors clocked.golf/tournaments: no date, venue or
// field size is published until confirmed. CTA leads to TournamentApplyScreen.
import { ScrollView, View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { COLOR, SPACING, RADIUS } from '../lib/theme';
import ScreenHeader from '../components/ScreenHeader';
import Button from '../components/Button';

const WHO_LIST = [
  'High school',
  'College',
  'Club',
  'Rec league',
  'Pro',
  'Any sport. Any level.',
];

const FORMAT_ITEMS = [
  { label: 'FORMAT', value: 'Clocked Golf. A time par on every hole, points for every score.' },
  { label: 'TEAMS', value: 'Two-player teams. Apply together.' },
  { label: 'SHOT CLOCK', value: 'Runs the whole round. Over time par costs points.' },
  { label: 'SCORING', value: 'Scored in the Clocked Golf app, the same way every round is.', highlight: true },
];

const CONFIRMED_ITEMS = [
  { value: 'South Florida', label: 'REGION' },
  { value: 'Clocked Golf', label: 'FORMAT' },
  { value: 'Athletes', label: 'BUILT FOR' },
];
const TBA_ITEMS = [
  { value: 'Date', label: 'TO BE ANNOUNCED' },
  { value: 'Venue', label: 'TO BE ANNOUNCED' },
  { value: 'Field size', label: 'TO BE ANNOUNCED' },
];

export default function TournamentScreen({ navigation }) {
  return (
    <SafeAreaView style={s.container}>
      <ScreenHeader title="FIRST EVENT" onBack={() => navigation.goBack()} borderless />

      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>

        {/* Hero */}
        <View style={s.hero}>
          <Text style={s.overline}>SOUTH FLORIDA {'\u00B7'} THE TOURNAMENT FOR ATHLETES</Text>
          <Text style={s.heroTitle}>The first</Text>
          <Text style={s.heroSub}>Clocked event.</Text>
          <View style={s.heroDivider} />
          <Text style={s.heroStatement}>
            A different style of golf competition is coming to South Florida.{' '}
            <Text style={s.heroStatementStrong}>If you've competed in another sport, this is your golf tournament.</Text>
          </Text>

          <View style={s.metaRow}>
            <View style={s.metaItem}>
              <Text style={s.metaLabel}>WHEN & WHERE</Text>
              <Text style={s.metaValue}>Date and venue to be announced.</Text>
            </View>
          </View>
          <View style={s.metaRow}>
            <View style={s.metaItem}>
              <Text style={s.metaLabel}>FORMAT</Text>
              <Text style={s.metaValue}>Clocked Golf {'\u00B7'} Two-Player Teams</Text>
            </View>
            <View style={s.metaItem}>
              <Text style={s.metaLabel}>FIELD</Text>
              <Text style={s.metaValue}>By Invitation</Text>
            </View>
          </View>
        </View>

        {/* Declaration */}
        <View style={s.section}>
          <Text style={s.eyebrow}>BUILT FOR ATHLETES</Text>
          <Text style={s.declarationLine}>You've competed before.</Text>
          <Text style={[s.declarationLine, s.accent]}>Now compete in golf.</Text>
          <Text style={s.body}>
            A Clocked tournament is played the Clocked way: a time par on every hole, points for every score, and a running clock that never stops. Two-player teams. Real consequences for slow play.{'\n\n'}
            It rewards players who are ready, decisive, and sharp under pressure. Athletes, in other words.
          </Text>
        </View>

        {/* Eligibility */}
        <View style={s.section}>
          <Text style={s.eyebrow}>WHO CAN COMPETE</Text>
          <Text style={s.sectionTitle}>You must have played another organized sport.</Text>
          <Text style={[s.body, { marginBottom: 16 }]}>
            Any sport. Any level. If you suited up for a team and competed, you qualify. We ask what you played on the application.
          </Text>
          <View style={s.whoList}>
            {WHO_LIST.map(item => (
              <View key={item} style={s.whoItem}>
                <Text style={s.whoItemText}>{item}</Text>
              </View>
            ))}
          </View>
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
          <Text style={s.sectionTitle}>Athletes who want pressure, not a leisurely stroll.</Text>
          <Text style={s.body}>
            The field will be limited and invitations go out from this list. We read every request and pick competitors who bring an athlete's mindset to the course: fast, focused, and ready to perform when it counts.
          </Text>
        </View>

        {/* Why */}
        <View style={s.section}>
          <Text style={s.eyebrow}>WHY COMPETE</Text>
          <Text style={s.sectionTitle}>Be in the first field.</Text>
          <View style={s.pullQuote}>
            <Text style={s.pullQuoteText}>"Invitations to the first event go out from this list first."</Text>
          </View>
          <Text style={s.body}>
            This is the beginning of something new. The players who step up now are the first names on the first Clocked leaderboard.
          </Text>
        </View>

        {/* Experience */}
        <View style={s.section}>
          <Text style={s.eyebrow}>WHERE THINGS STAND</Text>
          <Text style={s.sectionTitle}>Confirmed so far.</Text>
          <View style={s.expGrid}>
            {CONFIRMED_ITEMS.map(item => (
              <View key={item.label} style={s.expItem}>
                <Text style={s.expItemValue}>{item.value}</Text>
                <Text style={s.expItemLabel}>{item.label}</Text>
              </View>
            ))}
          </View>
          <Text style={[s.eyebrow, { marginTop: 20 }]}>NOT YET ANNOUNCED</Text>
          <View style={s.expGrid}>
            {TBA_ITEMS.map(item => (
              <View key={item.value} style={s.expItem}>
                <Text style={s.expItemValue}>{item.value}</Text>
                <Text style={s.expItemLabel}>{item.label}</Text>
              </View>
            ))}
          </View>
          <Text style={[s.body, { marginTop: 16 }]}>
            We'll publish the date, venue, field size, and entry details as they're confirmed. Nothing is open for registration yet; requesting an invitation expresses interest and doesn't guarantee a spot.
          </Text>
        </View>

        {/* Apply CTA */}
        <View style={s.applySection}>
          <Text style={s.eyebrow}>REQUEST AN INVITATION</Text>
          <Text style={s.sectionTitle}>Sign up to be considered for the first tournament.</Text>
          <Text style={s.body}>
            Tell us what you played and why your team belongs in the field. We'll share details as they become available, and the first invitations go out from this list.
          </Text>
          <Button label="REQUEST AN INVITATION" icon="arrow-forward" size="lg" onPress={() => navigation.navigate('TournamentApply')} style={{ marginTop: 8 }} />
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
  metaRow:          { flexDirection: 'row', gap: 24, marginBottom: 14 },
  metaItem:         { flex: 1 },
  metaLabel:        { fontSize: 9, fontWeight: '700', color: COLOR.dim, letterSpacing: 2, marginBottom: 4 },
  metaValue:        { fontSize: 14, color: COLOR.cream },

  section:          { marginBottom: 32 },
  eyebrow:          { fontSize: 10, fontWeight: '700', color: COLOR.gold, letterSpacing: 3, marginBottom: 14 },
  sectionTitle:     { fontSize: 21, fontWeight: '300', color: COLOR.cream, lineHeight: 27, marginBottom: 14 },
  declarationLine:  { fontSize: 19, fontWeight: '300', color: COLOR.cream, lineHeight: 25, marginBottom: 2 },
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
  expItemValue:     { fontSize: 16, fontWeight: '300', color: COLOR.gold, marginBottom: 8 },
  expItemLabel:     { fontSize: 9, color: COLOR.dim, letterSpacing: 1, textAlign: 'center', lineHeight: 14 },

  applySection:     { backgroundColor: COLOR.surface, borderRadius: RADIUS.lg, borderWidth: 1, borderColor: COLOR.borderGold, padding: SPACING.xl, marginBottom: SPACING.lg },
  closing:          { fontSize: 15, color: COLOR.cream, fontStyle: 'italic', textAlign: 'center', borderTopWidth: 1, borderTopColor: COLOR.border, paddingTop: SPACING.lg },
});
