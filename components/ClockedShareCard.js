import { View, Text, StyleSheet, Dimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { formatSecondsLong } from '../lib/clockedSport';
import CourseAvatar from './CourseAvatar';

const SIZE = Dimensions.get('window').width - 32;

const GOLD  = '#C9A84C';
const CREAM = '#F5EDD8';
const MUTED = '#B8A882';
const BG    = '#090F0A';
const GREEN = '#7DC87A';
const RED   = '#E85D4A';
const DIM   = '#7A6E58';

function scoreColor(score) {
  if (score > 0) return GREEN;
  if (score === 0) return CREAM;
  return RED;
}

function Corner({ style }) {
  return (
    <View style={[s.corner, style]}>
      <View style={s.cornerH} />
      <View style={s.cornerV} />
    </View>
  );
}

export default function ClockedShareCard({
  teamScore,
  totalElapsed,
  totalTimePar,
  playerTotals,
  formatBadge,
  courseName,
  date,
  isUnranked,
}) {
  const scoreStr = teamScore != null ? (teamScore > 0 ? `+${teamScore}` : String(teamScore)) : '--';
  const timeStr = formatSecondsLong(totalElapsed);
  const timeParStr = formatSecondsLong(totalTimePar);

  return (
    <View style={[s.card, { width: SIZE, height: SIZE }]}>

      {/* Corner accents */}
      <Corner style={{ top: 20, left: 20 }} />
      <Corner style={{ top: 20, right: 20, transform: [{ rotate: '90deg' }] }} />
      <Corner style={{ bottom: 20, left: 20, transform: [{ rotate: '270deg' }] }} />
      <Corner style={{ bottom: 20, right: 20, transform: [{ rotate: '180deg' }] }} />

      {/* Top — branding + format badge */}
      <View style={s.top}>
        <View>
          <Text style={s.wordmark}>CLOCKED</Text>
          <Text style={s.brandTagline}>SPORT</Text>
        </View>
        <View style={s.badgePill}>
          <Text style={s.badgeText}>{formatBadge || 'SOLO \u00B7 GROSS'}</Text>
        </View>
      </View>

      {/* Center — team score hero */}
      <View style={s.center}>
        <Text style={[s.scoreNumber, { color: scoreColor(teamScore ?? 0) }]}>
          {scoreStr}
        </Text>
        <View style={s.scoreLabelRow}>
          <View style={s.scoreLine} />
          <Text style={s.scoreLabel}>TEAM SCORE</Text>
          <View style={s.scoreLine} />
        </View>
      </View>

      {/* Player breakdown */}
      {playerTotals && playerTotals.length > 1 && (
        <View style={s.playersRow}>
          {playerTotals.map((p, i) => (
            <View key={i} style={s.playerItem}>
              <Text style={[s.playerPoints, { color: scoreColor(p.totalPoints) }]}>
                {p.totalPoints > 0 ? `+${p.totalPoints}` : p.totalPoints}
              </Text>
              <Text style={s.playerName} numberOfLines={1}>{p.name?.split(' ')[0] ?? ''}</Text>
            </View>
          ))}
        </View>
      )}

      {/* Course + date */}
      <View style={s.courseBlock}>
        {courseName && courseName !== 'Quick Play' && (
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginBottom: 6 }}>
            <CourseAvatar courseName={courseName} size={48} />
            <Text style={s.courseName} numberOfLines={1}>{courseName}</Text>
          </View>
        )}
        {(!courseName || courseName === 'Quick Play') && (
          <Text style={s.courseName} numberOfLines={1}>{courseName || 'Unknown Course'}</Text>
        )}
        <Text style={s.courseDate}>{date || '\u2014'}</Text>
      </View>

      {/* Divider */}
      <View style={s.divider} />

      {/* Time stat */}
      <View style={s.timeRow}>
        <View style={s.timeItem}>
          <Text style={s.timeValue}>{timeStr}</Text>
          <Text style={s.timeLabel}>TOTAL TIME</Text>
        </View>
        <View style={s.timeDot} />
        <View style={s.timeItem}>
          <Text style={s.timeValue}>{timeParStr}</Text>
          <Text style={s.timeLabel}>TIME PAR</Text>
        </View>
      </View>

      {/* Divider */}
      <View style={s.divider} />

      {/* Bottom */}
      <View style={s.bottom}>
        {isUnranked && <Text style={s.unrankedTag}>UNRANKED</Text>}
        <Text style={s.tagline}>clocked.golf</Text>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  card: {
    backgroundColor: BG,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: '#C9A84C33',
    justifyContent: 'space-between',
    paddingVertical: 28,
    paddingHorizontal: 28,
    overflow: 'hidden',
  },

  // Corner accents
  corner:  { position: 'absolute', width: 16, height: 16 },
  cornerH: { position: 'absolute', top: 0, left: 0, width: 16, height: 1, backgroundColor: GOLD },
  cornerV: { position: 'absolute', top: 0, left: 0, width: 1, height: 16, backgroundColor: GOLD },

  // Top
  top:           { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  wordmark:      { fontSize: 11, fontWeight: '700', color: GOLD, letterSpacing: 5 },
  brandTagline:  { fontSize: 8, fontWeight: '700', color: '#C9A84C99', letterSpacing: 3, marginTop: 2 },
  badgePill:     { borderWidth: 1, borderColor: '#C9A84C55', borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3 },
  badgeText:     { fontSize: 7, fontWeight: '700', color: GOLD, letterSpacing: 1.5 },

  // Score
  center:        { alignItems: 'center', flex: 1, justifyContent: 'center' },
  scoreNumber:   { fontSize: 88, fontWeight: '200', fontVariant: ['tabular-nums'], lineHeight: 96, letterSpacing: -2 },
  scoreLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 4 },
  scoreLine:     { flex: 1, height: 1, backgroundColor: '#C9A84C33' },
  scoreLabel:    { fontSize: 9, fontWeight: '700', color: GOLD, letterSpacing: 4 },

  // Players
  playersRow:    { flexDirection: 'row', justifyContent: 'center', gap: 20, marginBottom: 8 },
  playerItem:    { alignItems: 'center' },
  playerPoints:  { fontSize: 18, fontWeight: '600', fontVariant: ['tabular-nums'] },
  playerName:    { fontSize: 9, fontWeight: '600', color: DIM, letterSpacing: 1, marginTop: 2, maxWidth: 60 },

  // Course
  courseBlock:    { alignItems: 'center', marginBottom: 10 },
  courseName:    { fontSize: 18, fontWeight: '600', color: CREAM, textAlign: 'center', marginBottom: 4 },
  courseDate:     { fontSize: 10, fontWeight: '600', color: GOLD, letterSpacing: 2, textTransform: 'uppercase' },

  // Divider
  divider:       { height: 1, backgroundColor: '#C9A84C22', marginVertical: 6 },

  // Time
  timeRow:       { flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  timeItem:      { flex: 1, alignItems: 'center' },
  timeValue:     { fontSize: 14, fontWeight: '500', color: CREAM, fontVariant: ['tabular-nums'] },
  timeLabel:     { fontSize: 7, fontWeight: '700', color: MUTED, letterSpacing: 1.5, marginTop: 3 },
  timeDot:       { width: 3, height: 3, borderRadius: 1.5, backgroundColor: GOLD, opacity: 0.4, marginBottom: 8 },

  // Bottom
  bottom:        { alignItems: 'center', gap: 4 },
  unrankedTag:   { fontSize: 8, fontWeight: '700', color: '#D4844A', letterSpacing: 2 },
  tagline:       { fontSize: 10, color: MUTED, letterSpacing: 1.5, fontStyle: 'italic' },
});
