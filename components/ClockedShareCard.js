// ─── ClockedShareCard — Instagram-worthy round card ──────────────────────────
import { View, Text, Image, StyleSheet, Dimensions } from 'react-native';
import CourseAvatar from './CourseAvatar';

const SIZE = Dimensions.get('window').width - 32;

const GOLD  = '#C9A84C';
const CREAM = '#F5EDD8';
const MUTED = '#B8A882';
const BG    = '#090F0A';
const CARD  = '#0D1A0F';
const GREEN = '#7DC87A';
const RED   = '#E85D4A';
const DIM   = '#7A6E58';

function scoreColor(v) { return v >= 0 ? GREEN : RED; }

function holePill(holeScore) {
  // holeScore = sum of all players' points for that hole (before penalty)
  if (holeScore >= 3) return { bg: GREEN + '22', border: GREEN, text: GREEN, label: holeScore >= 6 ? 'E' : 'B' };
  if (holeScore >= 1) return { bg: GOLD + '22', border: GOLD + '44', text: GOLD + '88', label: 'P' };
  if (holeScore === 0) return { bg: 'transparent', border: CREAM + '22', text: CREAM + '55', label: '\u00B7' };
  return { bg: RED + '22', border: RED, text: RED, label: '\u2212' };
}

export default function ClockedShareCard({
  teamScore,
  playerTotals,
  courseName,
  date,
  holes,
  holeScores,
}) {
  const scoreStr = teamScore != null ? (teamScore > 0 ? `+${teamScore}` : String(teamScore)) : '--';

  // Compute stats from hole data
  const holeData = holeScores ?? [];
  const birdiesPlus = holeData.filter(h => h.teamPointsBeforePenalty >= 3).length;
  const penalties = holeData.filter(h => h.penalty < 0).length;

  return (
    <View style={s.card}>

      {/* ── TOP BAR ── */}
      <View style={s.topBar}>
        <Image
          source={require('../assets/PlayThru_AppIcon.png')}
          style={s.logoMark}
          resizeMode="contain"
        />
        <Text style={s.topLabel}>GOLF ON THE CLOCK</Text>
      </View>

      {/* ── COURSE HERO ── */}
      <View style={s.courseHero}>
        {courseName && courseName !== 'Quick Play' ? (
          <View style={s.coursePhotoWrap}>
            <CourseAvatar courseName={courseName} size={SIZE - 2} />
            <View style={s.courseScrim}>
              <Text style={s.courseHeroName} numberOfLines={1}>{courseName}</Text>
            </View>
          </View>
        ) : (
          <View style={s.coursePlaceholder}>
            <Text style={{ fontSize: 32 }}>{'\u26F3'}</Text>
            <Text style={s.coursePlaceholderText}>Quick Play</Text>
          </View>
        )}
      </View>

      {/* ── SCORE HERO ── */}
      <View style={s.scoreBlock}>
        <Text style={[s.scoreHero, { color: scoreColor(teamScore ?? 0) }]}>
          {scoreStr}
        </Text>
        <Text style={s.scoreSub}>PTS</Text>
      </View>

      {/* ── HOLE BREAKDOWN ── */}
      {holeData.length > 0 && (
        <View style={s.pillRow}>
          {holeData.map((h, i) => {
            const pts = h.teamPointsBeforePenalty ?? 0;
            const p = holePill(pts);
            return (
              <View key={i} style={[s.pill, { backgroundColor: p.bg, borderColor: p.border }]}>
                <Text style={[s.pillText, { color: p.text }]}>{p.label}</Text>
              </View>
            );
          })}
        </View>
      )}

      {/* ── STATS ROW ── */}
      <View style={s.statsRow}>
        <View style={s.statChip}>
          <Text style={s.statLabel}>BIRDIES+</Text>
          <Text style={[s.statNum, { color: birdiesPlus > 0 ? GREEN : DIM }]}>{birdiesPlus}</Text>
        </View>
        <View style={s.statChip}>
          <Text style={s.statLabel}>PENALTIES</Text>
          <Text style={[s.statNum, { color: penalties > 0 ? RED : DIM }]}>{penalties}</Text>
        </View>
        <View style={s.statChip}>
          <Text style={s.statLabel}>HOLES</Text>
          <Text style={[s.statNum, { color: GOLD }]}>{holes ?? '9'}</Text>
        </View>
      </View>

      {/* ── PLAYER BREAKDOWN (2+ players) ── */}
      {playerTotals && playerTotals.length > 1 && (
        <Text style={s.playerLine}>
          {playerTotals.map((p, i) => {
            const name = (p.name ?? '').split(' ')[0];
            const pts = p.totalPoints > 0 ? `+${p.totalPoints}` : p.totalPoints;
            return `${name} ${pts}`;
          }).join('  \u00B7  ')}
        </Text>
      )}

      {/* ── BOTTOM ── */}
      <View style={s.bottomBlock}>
        <Text style={s.dateText}>{date ?? ''}</Text>
        <View style={s.bottomDivider} />
      </View>

    </View>
  );
}

const s = StyleSheet.create({
  card: {
    width: SIZE, backgroundColor: BG, borderRadius: 20,
    borderWidth: 1, borderColor: GOLD + '33',
    overflow: 'hidden',
  },

  // Top bar
  topBar:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 14, paddingBottom: 8 },
  logoMark:  { width: 32, height: 32, opacity: 0.9 },
  topLabel:  { fontSize: 9, fontWeight: '700', color: GOLD, letterSpacing: 3 },

  // Course hero
  courseHero:       { width: '100%', height: 120, backgroundColor: CARD },
  coursePhotoWrap:  { width: '100%', height: 120, overflow: 'hidden' },
  courseScrim:      { position: 'absolute', bottom: 0, left: 0, right: 0, paddingVertical: 8, paddingHorizontal: 14, backgroundColor: 'rgba(9,15,10,0.7)' },
  courseHeroName:   { fontSize: 16, fontWeight: '700', color: '#fff' },
  coursePlaceholder: { width: '100%', height: 120, backgroundColor: CARD, alignItems: 'center', justifyContent: 'center' },
  coursePlaceholderText: { fontSize: 12, color: DIM, marginTop: 4 },

  // Score
  scoreBlock: { alignItems: 'center', paddingVertical: 16 },
  scoreHero:  { fontSize: 96, fontWeight: '700', fontVariant: ['tabular-nums'], lineHeight: 100, letterSpacing: -3 },
  scoreSub:   { fontSize: 11, fontWeight: '700', color: GOLD, letterSpacing: 4, marginTop: -4 },

  // Hole pills
  pillRow:    { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 4, paddingHorizontal: 16, marginBottom: 14 },
  pill:       { width: 28, height: 28, borderRadius: 14, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  pillText:   { fontSize: 10, fontWeight: '700' },

  // Stats
  statsRow:   { flexDirection: 'row', justifyContent: 'center', gap: 10, paddingHorizontal: 16, marginBottom: 14 },
  statChip:   { backgroundColor: CARD, borderRadius: 10, borderWidth: 1, borderColor: '#7DC87A22', paddingVertical: 8, paddingHorizontal: 14, alignItems: 'center' },
  statLabel:  { fontSize: 7, fontWeight: '700', color: DIM, letterSpacing: 1.5, marginBottom: 2 },
  statNum:    { fontSize: 18, fontWeight: '700', fontVariant: ['tabular-nums'] },

  // Players
  playerLine: { fontSize: 12, color: MUTED, textAlign: 'center', marginBottom: 12, paddingHorizontal: 16 },

  // Bottom
  bottomBlock:   { alignItems: 'center', paddingBottom: 16, paddingHorizontal: 16 },
  dateText:      { fontSize: 11, color: MUTED, marginBottom: 8, letterSpacing: 1 },
  bottomDivider: { width: 40, height: 1, backgroundColor: GOLD + '44' },
});
