import { View, Text, StyleSheet, Dimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

const SIZE = Dimensions.get('window').width - 32; // full-bleed square with margin

function formatDuration(minutes) {
  if (!minutes && minutes !== 0) return '—';
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h}h ${String(m).padStart(2, '0')}m`;
}

function popColor(score) {
  if (score >= 4.5) return '#A8E6A3';
  if (score >= 4.0) return '#7DC87A';
  if (score >= 3.5) return '#D4B86A';
  return '#C07A6A';
}

// Decorative corner accent
function Corner({ style }) {
  return (
    <View style={[s.corner, style]}>
      <View style={s.cornerH} />
      <View style={s.cornerV} />
    </View>
  );
}

export default function ShareCard({ popScore, courseName, date, holes, transport, durationMinutes }) {
  const score     = typeof popScore === 'number' ? popScore : parseFloat(popScore) || 0;
  const scoreStr  = score.toFixed(1);
  const scoreColor = popColor(score);

  return (
    <View style={[s.card, { width: SIZE, height: SIZE }]}>

      {/* Corner accents */}
      <Corner style={{ top: 20, left: 20 }} />
      <Corner style={{ top: 20, right: 20, transform: [{ rotate: '90deg' }] }} />
      <Corner style={{ bottom: 20, left: 20, transform: [{ rotate: '270deg' }] }} />
      <Corner style={{ bottom: 20, right: 20, transform: [{ rotate: '180deg' }] }} />

      {/* Top — wordmark */}
      <View style={s.top}>
        <Ionicons name="star" size={10} color={GOLD} />
        <Text style={s.wordmark}>PLAYTHRU</Text>
      </View>

      {/* Center — POPScore */}
      <View style={s.center}>
        <Text style={[s.scoreNumber, { color: scoreColor }]}>{scoreStr}</Text>
        <View style={s.scoreLabelRow}>
          <View style={s.scoreLine} />
          <Text style={s.scoreLabel}>POPSCORE</Text>
          <View style={s.scoreLine} />
        </View>
      </View>

      {/* Course + date */}
      <View style={s.courseBlock}>
        <Text style={s.courseName} numberOfLines={1}>{courseName || 'Unknown Course'}</Text>
        <Text style={s.courseDate}>{date || '—'}</Text>
      </View>

      {/* Divider */}
      <View style={s.divider} />

      {/* Stats row */}
      <View style={s.statsRow}>
        <View style={s.statItem}>
          <Text style={s.statValue}>{holes || '18'}</Text>
          <Text style={s.statLabel}>HOLES</Text>
        </View>
        <View style={s.statDot} />
        <View style={s.statItem}>
          <Text style={s.statValue}>{transport || '—'}</Text>
          <Text style={s.statLabel}>TRANSPORT</Text>
        </View>
        <View style={s.statDot} />
        <View style={s.statItem}>
          <Text style={s.statValue}>{formatDuration(durationMinutes)}</Text>
          <Text style={s.statLabel}>DURATION</Text>
        </View>
      </View>

      {/* Divider */}
      <View style={s.divider} />

      {/* Tagline */}
      <View style={s.bottom}>
        <Text style={s.tagline}>Track your pace at playthru.com</Text>
      </View>
    </View>
  );
}

const GOLD   = '#C9A84C';
const CREAM  = '#F5EDD8';
const MUTED  = '#B8A882';
const BG     = '#090F0A';
const CARD   = '#0D1A0F';

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
  top: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  star: { fontSize: 10, color: GOLD },
  wordmark: { fontSize: 11, fontWeight: '700', color: GOLD, letterSpacing: 5 },

  // Score
  center: { alignItems: 'center', flex: 1, justifyContent: 'center' },
  scoreNumber: {
    fontSize: 100,
    fontWeight: '300',
    fontFamily: 'monospace',
    lineHeight: 108,
    letterSpacing: -2,
  },
  scoreLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 4 },
  scoreLine: { flex: 1, height: 1, backgroundColor: '#C9A84C33' },
  scoreLabel: { fontSize: 9, fontWeight: '700', color: GOLD, letterSpacing: 4 },

  // Course
  courseBlock: { alignItems: 'center', marginBottom: 12 },
  courseName: { fontSize: 20, fontWeight: '600', color: CREAM, textAlign: 'center', marginBottom: 4 },
  courseDate: { fontSize: 11, fontWeight: '600', color: GOLD, letterSpacing: 2, textTransform: 'uppercase' },

  // Divider
  divider: { height: 1, backgroundColor: '#C9A84C22', marginVertical: 8 },

  // Stats
  statsRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 0 },
  statItem: { flex: 1, alignItems: 'center' },
  statValue: { fontSize: 14, fontWeight: '500', color: CREAM, fontFamily: 'monospace' },
  statLabel: { fontSize: 7, fontWeight: '700', color: MUTED, letterSpacing: 1.5, marginTop: 3 },
  statDot:   { width: 3, height: 3, borderRadius: 1.5, backgroundColor: GOLD, opacity: 0.4, marginBottom: 8 },

  // Bottom
  bottom: { alignItems: 'center' },
  tagline: { fontSize: 10, color: MUTED, letterSpacing: 1.5, fontStyle: 'italic' },
});
