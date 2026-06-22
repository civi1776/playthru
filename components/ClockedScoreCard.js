// ─── ClockedScoreCard — Two-stat player card ────────────────────────────────
// Full version: headline on You tab.
// Square share version: for Feed / screenshot (reuses ClockedShareCard visual language).

import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

const GOLD  = '#C9A84C';
const CREAM = '#F5EDD8';
const MUTED = '#B8A882';
const DIM   = '#7A6E58';
const BG    = '#090F0A';
const CARD  = '#0D1A0F';
const GREEN = '#7DC87A';
const BORDER = '#7DC87A22';

function scoreColor(v) {
  if (v == null) return DIM;
  if (v >= 70) return GREEN;
  if (v >= 40) return GOLD;
  return MUTED;
}

function Bar({ value, color }) {
  const pct = value != null ? Math.max(0, Math.min(100, value)) : 0;
  return (
    <View style={s.barTrack}>
      <View style={[s.barFill, { width: `${pct}%`, backgroundColor: color }]} />
    </View>
  );
}

// ─── Full Card (You tab headline) ────────────────────────────────────────────

export default function ClockedScoreCard({ clockedScore, game, teammate, isProvisional, roundsUsed, roundsNeeded }) {
  const hasScore = clockedScore != null;
  const displayScore = hasScore ? String(clockedScore) : '\u2014';

  return (
    <View style={s.card}>
      {/* Header */}
      <View style={s.headerRow}>
        <Text style={s.headerLabel}>CLOCKED SCORE</Text>
        {isProvisional && (
          <View style={s.provBadge}>
            <Text style={s.provText}>PROVISIONAL</Text>
          </View>
        )}
      </View>

      {/* Headline number */}
      <View style={s.heroRow}>
        <Text style={[s.heroNumber, { color: scoreColor(clockedScore) }]}>
          {displayScore}
        </Text>
        {hasScore && <Text style={s.heroMax}>/100</Text>}
      </View>

      {/* Sub-stats */}
      <View style={s.statsRow}>
        {/* GAME */}
        <View style={s.statCol}>
          <View style={s.statHeader}>
            <Text style={s.statLabel}>GAME</Text>
            <Text style={[s.statValue, { color: scoreColor(game) }]}>
              {game != null ? Math.round(game) : '\u2014'}
            </Text>
          </View>
          <Bar value={game} color={scoreColor(game)} />
          <Text style={s.statDesc}>Sport skill</Text>
        </View>

        <View style={s.statDivider} />

        {/* TEAMMATE */}
        <View style={s.statCol}>
          <View style={s.statHeader}>
            <Text style={s.statLabel}>TEAMMATE</Text>
            <Text style={[s.statValue, { color: scoreColor(teammate) }]}>
              {teammate != null ? Math.round(teammate) : '\u2014'}
            </Text>
          </View>
          <Bar value={teammate} color={scoreColor(teammate)} />
          <Text style={s.statDesc}>Partnership value</Text>
        </View>
      </View>

      {/* Provisional hint */}
      {isProvisional && roundsNeeded > 0 && (
        <Text style={s.provHint}>
          {roundsUsed === 0
            ? 'Play your first round to start building your score'
            : `${roundsNeeded} more round${roundsNeeded !== 1 ? 's' : ''} to lock it in`}
        </Text>
      )}
    </View>
  );
}

// ─── Compact Card (for use in lists / share previews) ────────────────────────

export function ClockedScoreCardCompact({ clockedScore, game, teammate, isProvisional, playerName }) {
  return (
    <View style={sc.card}>
      <View style={sc.top}>
        <Text style={sc.name} numberOfLines={1}>{playerName ?? ''}</Text>
        {isProvisional && <Text style={sc.prov}>PROV</Text>}
      </View>
      <Text style={[sc.score, { color: scoreColor(clockedScore) }]}>
        {clockedScore != null ? clockedScore : '\u2014'}
      </Text>
      <View style={sc.stats}>
        <Text style={sc.stat}>G {game != null ? Math.round(game) : '\u2014'}</Text>
        <Text style={sc.dot}>{'\u00B7'}</Text>
        <Text style={sc.stat}>T {teammate != null ? Math.round(teammate) : '\u2014'}</Text>
      </View>
    </View>
  );
}

// ─── Full card styles ────────────────────────────────────────────────────────
const s = StyleSheet.create({
  card: {
    backgroundColor: CARD, borderRadius: 18, borderWidth: 1, borderColor: GOLD + '33',
    padding: 20, marginHorizontal: 16, marginVertical: 12,
  },

  headerRow:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  headerLabel: { fontSize: 10, fontWeight: '700', color: GOLD, letterSpacing: 3 },
  provBadge:   { backgroundColor: GOLD + '18', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1, borderColor: GOLD + '33' },
  provText:    { fontSize: 8, fontWeight: '700', color: GOLD, letterSpacing: 1.5 },

  heroRow:     { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'center', marginBottom: 20 },
  heroNumber:  { fontSize: 72, fontWeight: '200', fontVariant: ['tabular-nums'], lineHeight: 78 },
  heroMax:     { fontSize: 18, fontWeight: '300', color: DIM, marginLeft: 4 },

  statsRow:    { flexDirection: 'row', gap: 0 },
  statCol:     { flex: 1, gap: 6 },
  statDivider: { width: 1, backgroundColor: BORDER, marginHorizontal: 14 },
  statHeader:  { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  statLabel:   { fontSize: 9, fontWeight: '700', color: DIM, letterSpacing: 2 },
  statValue:   { fontSize: 18, fontWeight: '600', fontVariant: ['tabular-nums'] },
  statDesc:    { fontSize: 9, color: DIM, marginTop: 2 },

  barTrack:    { height: 4, backgroundColor: '#1A2E1C', borderRadius: 2, overflow: 'hidden' },
  barFill:     { height: 4, borderRadius: 2 },

  provHint:    { fontSize: 11, color: DIM, textAlign: 'center', marginTop: 14, fontStyle: 'italic' },
});

// ─── Compact card styles ─────────────────────────────────────────────────────
const sc = StyleSheet.create({
  card:  { backgroundColor: CARD, borderRadius: 12, borderWidth: 1, borderColor: BORDER, padding: 12, alignItems: 'center', minWidth: 100 },
  top:   { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 },
  name:  { fontSize: 11, fontWeight: '600', color: CREAM, maxWidth: 80 },
  prov:  { fontSize: 7, fontWeight: '700', color: GOLD, letterSpacing: 1 },
  score: { fontSize: 32, fontWeight: '200', fontVariant: ['tabular-nums'], lineHeight: 36 },
  stats: { flexDirection: 'row', gap: 6, marginTop: 2 },
  stat:  { fontSize: 9, fontWeight: '600', color: DIM },
  dot:   { fontSize: 9, color: DIM },
});
