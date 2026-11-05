// ─── ArcadeBoardRow — one line of an arcade board, level always visible ─────
// Used by the Ranks tab, the arcade lobby and the profiles so every arcade
// list in the app reads the same way: rank, who, time, and a difficulty chip
// that says which level the run was. A +23 on beginner and a +23 on pro are
// not the same thing, and the row never lets you forget it.

import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import InitialsAvatar from '../InitialsAvatar';
import { formatSeconds } from '../../lib/clockedSport';
import { COLOR, RADIUS } from '../../lib/theme';

export const DIFFICULTY_META = {
  beginner:     { label: 'BEGINNER', color: COLOR.green },
  intermediate: { label: 'INTER',    color: COLOR.gold },
  pro:          { label: 'PRO',      color: COLOR.red },
};

export function DifficultyChip({ difficulty, size = 'sm', style }) {
  const m = DIFFICULTY_META[difficulty] ?? { label: String(difficulty ?? '').toUpperCase(), color: COLOR.muted };
  return (
    <View style={[s.chip, { borderColor: m.color + '66', backgroundColor: m.color + '14' }, size === 'md' && s.chipMd, style]}>
      <Text style={[s.chipText, { color: m.color }, size === 'md' && s.chipTextMd]}>{m.label}</Text>
    </View>
  );
}

export default function ArcadeBoardRow({ row, rank, isYou, last, onPress }) {
  const p = row.profile;
  const name = p?.full_name || (p?.username ? `@${p.username}` : 'Player');
  const r = rank ?? row.rank;
  const Wrap = onPress ? TouchableOpacity : View;
  return (
    <Wrap style={[s.row, !last && s.rowBorder, isYou && s.rowYou]} onPress={onPress} activeOpacity={0.8} accessibilityRole={onPress ? 'button' : undefined}>
      <Text style={[s.rank, r <= 3 && { color: COLOR.gold }]}>{r}</Text>
      <InitialsAvatar name={p?.full_name} username={p?.username} avatarUrl={p?.avatar_url} size={32} />
      <View style={{ flex: 1, marginLeft: 10 }}>
        <Text style={[s.name, isYou && { color: COLOR.gold }]} numberOfLines={1}>{name}{isYou ? '  (you)' : ''}</Text>
        <View style={s.metaRow}>
          <DifficultyChip difficulty={row.difficulty} />
          <Text style={s.meta}>{formatSeconds(row.total_seconds)}{row.holes_under_clock != null ? ` · ${row.holes_under_clock}/9 under` : ''}</Text>
        </View>
      </View>
      <Text style={[s.pts, { color: row.points >= 9 ? COLOR.green : row.points >= 0 ? COLOR.gold : COLOR.red }]}>
        {row.points > 0 ? `+${row.points}` : row.points}
      </Text>
    </Wrap>
  );
}

const s = StyleSheet.create({
  row:       { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, paddingHorizontal: 12 },
  rowBorder: { borderBottomWidth: 1, borderBottomColor: COLOR.border },
  rowYou:    { backgroundColor: '#C9A84C0A' },
  rank:      { width: 24, fontSize: 13, fontWeight: '700', color: COLOR.muted, fontVariant: ['tabular-nums'] },
  name:      { fontSize: 14, fontWeight: '600', color: COLOR.cream },
  metaRow:   { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 3 },
  meta:      { fontSize: 10, color: COLOR.dim, fontVariant: ['tabular-nums'] },
  pts:       { fontSize: 20, fontWeight: '300', fontVariant: ['tabular-nums'], minWidth: 44, textAlign: 'right' },
  chip:      { borderWidth: 1, borderRadius: RADIUS.xs, paddingHorizontal: 5, paddingVertical: 1 },
  chipText:  { fontSize: 7, fontWeight: '800', letterSpacing: 1 },
  chipMd:    { paddingHorizontal: 8, paddingVertical: 3 },
  chipTextMd:{ fontSize: 9, letterSpacing: 1.5 },
});
