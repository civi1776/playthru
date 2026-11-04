// ─── RecentRoundsList — compact round rows for profiles ──────────────────────
// Reusable on own profile and public profile. Shows last N rounds with
// course, date, format, and result. Rounds tagged by lib/headToHead
// (`_pts`, `_confirmed`) show that player's own points; otherwise the
// round's team total is used.

import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import CourseAvatar from './CourseAvatar';
import { COLOR, RADIUS } from '../lib/theme';

function formatShortDate(isoStr) {
  if (!isoStr) return '';
  const d = new Date(isoStr);
  const mo = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${mo[d.getMonth()]} ${d.getDate()}`;
}

function formatDuration(minutes) {
  if (!minutes || minutes < 1) return null;
  const h = Math.floor(minutes / 60), m = minutes % 60;
  return h ? `${h}h ${String(m).padStart(2, '0')}m` : `${m}m`;
}

function pointsOf(round) {
  if (round._pts != null) return round._pts;
  return round.active_game?.summary?.totalScore ?? null;
}

function resultColor(round) {
  if (round.round_format === 'clocked') {
    const pts = pointsOf(round);
    if (pts == null) return COLOR.muted;
    return pts >= 0 ? COLOR.green : COLOR.red;
  }
  return COLOR.muted;
}

function resultText(round) {
  if (round.round_format === 'clocked') {
    const pts = pointsOf(round);
    if (pts == null) return '—';
    return pts > 0 ? `+${pts}` : String(pts);
  }
  return formatDuration(round.duration_minutes) ?? '—';
}

function resultLabel(round) {
  return round.round_format === 'clocked' ? 'PTS' : 'LEGACY';
}

function formatLabel(round) {
  const d = round.difficulty;
  if (d === 'pro') return 'PRO';
  if (d === 'beginner') return 'BEGINNER';
  return 'INTER.';
}

function difficultyColor(d) {
  if (d === 'pro') return COLOR.red;
  if (d === 'beginner') return COLOR.green;
  return COLOR.gold;
}

export default function RecentRoundsList({ rounds, navigation, limit = 10, title = 'RECENT ROUNDS' }) {
  if (!rounds?.length) return null;
  const display = rounds.slice(0, limit);

  return (
    <View style={s.container}>
      {!!title && <Text style={s.header}>{title}</Text>}
      {display.map((r, i) => {
        const clocked = r.round_format === 'clocked';
        const playerCount = r.players ?? r.hole_scores?.[0]?.players?.length ?? null;
        return (
          <TouchableOpacity
            key={r.id ?? i}
            style={[s.row, !clocked && s.rowLegacy]}
            onPress={() => r.course_name && navigation?.navigate('CourseProfile', { course: { name: r.course_name } })}
            activeOpacity={0.8}
          >
            <CourseAvatar courseName={r.course_name || ''} size={32} />
            <View style={s.info}>
              <Text style={s.course} numberOfLines={1}>{r.course_name || 'Quick Play'}</Text>
              <Text style={s.meta} numberOfLines={1}>
                {formatShortDate(r.created_at)}
                {r.holes ? ` · ${r.holes} holes` : ''}
                {playerCount > 1 ? ` · ${playerCount} players` : ''}
                {clocked && <Text style={{ color: difficultyColor(r.difficulty) }}>{` · ${formatLabel(r)}`}</Text>}
                {clocked && r._confirmed === false && <Text style={{ color: COLOR.dim }}>{' · unconfirmed'}</Text>}
              </Text>
            </View>
            <View style={s.resultCol}>
              <Text style={[clocked ? s.resultNum : s.resultTime, { color: resultColor(r) }]}>{resultText(r)}</Text>
              <Text style={s.resultLabel}>{resultLabel(r)}</Text>
            </View>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const s = StyleSheet.create({
  container:  { paddingHorizontal: 16, marginBottom: 8 },
  header:     { fontSize: 9, fontWeight: '700', color: COLOR.gold, letterSpacing: 3, marginBottom: 8 },
  row:        { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: COLOR.surface, borderRadius: RADIUS.sm, borderWidth: 1, borderColor: '#7DC87A18', borderLeftWidth: 3, borderLeftColor: COLOR.gold, padding: 10, marginBottom: 6 },
  rowLegacy:  { borderLeftColor: COLOR.dim },
  info:       { flex: 1 },
  course:     { fontSize: 13, fontWeight: '500', color: COLOR.cream, marginBottom: 2 },
  meta:       { fontSize: 10, color: COLOR.muted },
  resultCol:  { alignItems: 'flex-end', minWidth: 44 },
  resultNum:  { fontSize: 20, fontWeight: '700', fontVariant: ['tabular-nums'] },
  resultTime: { fontSize: 13, fontWeight: '600', fontVariant: ['tabular-nums'] },
  resultLabel:{ fontSize: 9, fontWeight: '700', color: COLOR.dim, letterSpacing: 1, marginTop: 1 },
});
