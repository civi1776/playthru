// ─── ArcadeRecordCard — a player's arcade record, kept apart from the course ─
// Profiles show two different things: what a player does on a real course
// with a real clock, and what they do in the game. They must never blur. This
// card is the arcade half, labelled as such, with the level on every number.

import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { DifficultyChip } from './ArcadeBoardRow';
import { formatSeconds } from '../../lib/clockedSport';
import { QUALIFY_TOP } from '../../lib/arcade/season';
import { COLOR, RADIUS } from '../../lib/theme';

const signed = v => (v == null ? '—' : v > 0 ? `+${v}` : String(v));
const ORDER = ['beginner', 'intermediate', 'pro'];

export default function ArcadeRecordCard({ rec, onPress, isOwn = false }) {
  const Wrap = onPress ? TouchableOpacity : View;
  return (
    <View style={s.wrap}>
      <View style={s.head}>
        <View style={s.headLeft}>
          <Ionicons name="game-controller" size={12} color={COLOR.gold} />
          <Text style={s.label}>IN THE ARCADE</Text>
        </View>
        {!!onPress && (
          <TouchableOpacity onPress={onPress} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel="Open the arcade">
            <Text style={s.link}>{isOwn ? 'PLAY NINE' : 'ARCADE'}  {'›'}</Text>
          </TouchableOpacity>
        )}
      </View>

      <Wrap style={s.card} onPress={onPress} activeOpacity={0.85}>
        {rec == null ? (
          <Text style={s.empty}>Loading{'…'}</Text>
        ) : rec.runs === 0 ? (
          <>
            <Text style={s.emptyTitle}>{isOwn ? 'No arcade runs yet.' : 'No arcade runs yet.'}</Text>
            <Text style={s.empty}>Nine holes, the same clock, no tee time. Intermediate and pro runs count toward the monthly board.</Text>
          </>
        ) : (
          <>
            <View style={s.tiles}>
              <View style={s.tile}>
                <Text style={s.tileLabel}>BEST NINE</Text>
                <Text style={[s.tileValue, { color: rec.best.points >= 9 ? COLOR.green : COLOR.gold }]}>{signed(rec.best.points)}</Text>
                <View style={s.tileMetaRow}>
                  <DifficultyChip difficulty={rec.best.difficulty} />
                  <Text style={s.tileMeta}>{formatSeconds(rec.best.total_seconds)}</Text>
                </View>
              </View>
              <View style={s.tile}>
                <Text style={s.tileLabel}>RUNS</Text>
                <Text style={s.tileValue}>{rec.runs}</Text>
                <Text style={s.tileMeta}>nine holes</Text>
              </View>
              <View style={s.tile}>
                <Text style={s.tileLabel}>THIS MONTH</Text>
                <Text style={[s.tileValue, rec.monthRank && rec.monthRank <= QUALIFY_TOP && { color: COLOR.gold }]}>{rec.monthRank ? `#${rec.monthRank}` : '—'}</Text>
                <Text style={s.tileMeta}>{rec.monthRank ? (rec.monthRank <= QUALIFY_TOP ? 'qualifying' : `top ${QUALIFY_TOP} qualifies`) : 'no qualifying run'}</Text>
              </View>
            </View>
            <View style={s.bests}>
              <Text style={s.bestsLabel}>BEST BY LEVEL</Text>
              {ORDER.map(d => (
                <View key={d} style={s.bestItem}>
                  <DifficultyChip difficulty={d} />
                  <Text style={[s.bestPts, !rec.bestBy[d] && { color: COLOR.dim }]}>{rec.bestBy[d] ? signed(rec.bestBy[d].points) : '—'}</Text>
                </View>
              ))}
            </View>
          </>
        )}
      </Wrap>
      <Text style={s.foot}>Arcade runs never touch a Clocked Score or round history.</Text>
    </View>
  );
}

const s = StyleSheet.create({
  wrap:       { marginHorizontal: 16, marginTop: 18, marginBottom: 16 },
  head:       { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  headLeft:   { flexDirection: 'row', alignItems: 'center', gap: 6 },
  label:      { fontSize: 9, fontWeight: '700', color: COLOR.gold, letterSpacing: 3 },
  link:       { fontSize: 9, fontWeight: '800', color: COLOR.muted, letterSpacing: 1.5 },
  card:       { backgroundColor: COLOR.surface, borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLOR.border, padding: 12 },
  tiles:      { flexDirection: 'row', gap: 8 },
  tile:       { flex: 1, alignItems: 'center', paddingVertical: 6 },
  tileLabel:  { fontSize: 8, fontWeight: '700', color: COLOR.dim, letterSpacing: 1.2, marginBottom: 4 },
  tileValue:  { fontSize: 20, fontWeight: '300', color: COLOR.cream, fontVariant: ['tabular-nums'] },
  tileMetaRow:{ flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 4 },
  tileMeta:   { fontSize: 8, color: COLOR.dim, marginTop: 3 },
  bests:      { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: COLOR.border },
  bestsLabel: { fontSize: 8, fontWeight: '700', color: COLOR.dim, letterSpacing: 1.2, marginRight: 2 },
  bestItem:   { flexDirection: 'row', alignItems: 'center', gap: 4 },
  bestPts:    { fontSize: 12, fontWeight: '700', color: COLOR.cream, fontVariant: ['tabular-nums'] },
  emptyTitle: { fontSize: 14, fontWeight: '600', color: COLOR.cream },
  empty:      { fontSize: 11, color: COLOR.dim, lineHeight: 16, marginTop: 3 },
  foot:       { fontSize: 9, color: COLOR.dim, marginTop: 6, fontStyle: 'italic' },
});
