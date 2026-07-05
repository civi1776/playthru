// ─── RecentRoundsList — compact round rows for profiles ──────────────────────
// Reusable on own profile and public profile. Shows last N rounds with
// course, date, format, and result.

import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import CourseAvatar from './CourseAvatar';

function formatShortDate(isoStr) {
  if (!isoStr) return '';
  const d = new Date(isoStr);
  const mo = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${mo[d.getMonth()]} ${d.getDate()}`;
}

function resultColor(round) {
  if (round.round_format === 'clocked') {
    const pts = round.active_game?.summary?.totalScore;
    if (pts == null) return '#B8A882';
    return pts >= 0 ? '#7DC87A' : '#E85D4A';
  }
  const pop = round.pop_score;
  if (pop == null) return '#B8A882';
  if (pop >= 4.0) return '#7DC87A';
  if (pop >= 3.0) return '#D4B86A';
  return '#C07A6A';
}

function resultText(round) {
  if (round.round_format === 'clocked') {
    const pts = round.active_game?.summary?.totalScore;
    if (pts == null) return '\u2014';
    return pts > 0 ? `+${pts}` : String(pts);
  }
  return round.pop_score != null ? round.pop_score.toFixed(1) : '\u2014';
}

function resultLabel(round) {
  return round.round_format === 'clocked' ? 'PTS' : 'pace';
}

function formatLabel(round) {
  if (round.round_format !== 'clocked') return 'pace';
  const d = round.difficulty;
  if (d === 'pro') return 'PRO';
  if (d === 'beginner') return 'BEGINNER';
  return 'INTER.';
}

function difficultyColor(d) {
  if (d === 'pro') return '#E85D4A';
  if (d === 'beginner') return '#7DC87A';
  return '#C9A84C';
}

export default function RecentRoundsList({ rounds, navigation, limit = 10 }) {
  if (!rounds?.length) return null;
  const display = rounds.slice(0, limit);

  return (
    <View style={s.container}>
      <Text style={s.header}>RECENT ROUNDS</Text>
      {display.map((r, i) => (
        <TouchableOpacity
          key={r.id ?? i}
          style={s.row}
          onPress={() => r.course_name && navigation?.navigate('CourseProfile', { course: { name: r.course_name } })}
          activeOpacity={0.8}
        >
          <CourseAvatar courseName={r.course_name || ''} size={32} />
          <View style={s.info}>
            <Text style={s.course} numberOfLines={1}>{r.course_name || 'Quick Play'}</Text>
            <Text style={s.meta}>
              {formatShortDate(r.created_at)}
              {r.holes ? ` \u00B7 ${r.holes}h` : ''}
              {r.round_format === 'clocked' && (
                <Text style={{ color: difficultyColor(r.difficulty) }}>{` \u00B7 ${formatLabel(r)}`}</Text>
              )}
              {r.round_format !== 'clocked' && ` \u00B7 ${formatLabel(r)}`}
            </Text>
          </View>
          <View style={s.resultCol}>
            <Text style={[s.resultNum, { color: resultColor(r) }]}>{resultText(r)}</Text>
            <Text style={s.resultLabel}>{resultLabel(r)}</Text>
          </View>
        </TouchableOpacity>
      ))}
    </View>
  );
}

const s = StyleSheet.create({
  container:  { paddingHorizontal: 16, marginBottom: 8 },
  header:     { fontSize: 9, fontWeight: '700', color: '#C9A84C', letterSpacing: 3, marginBottom: 8 },
  row:        { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#0D1A0F', borderRadius: 10, borderWidth: 1, borderColor: '#7DC87A18', borderLeftWidth: 3, borderLeftColor: '#C9A84C', padding: 10, marginBottom: 6 },
  info:       { flex: 1 },
  course:     { fontSize: 13, fontWeight: '500', color: '#F5EDD8', marginBottom: 2 },
  meta:       { fontSize: 10, color: '#B8A882' },
  resultCol:  { alignItems: 'flex-end', minWidth: 44 },
  resultNum:  { fontSize: 20, fontWeight: '700', fontVariant: ['tabular-nums'] },
  resultLabel:{ fontSize: 9, fontWeight: '700', color: '#7A6E58', letterSpacing: 1, marginTop: 1 },
});
