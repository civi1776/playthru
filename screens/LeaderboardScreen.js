import { useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, SafeAreaView } from 'react-native';

const GLOBAL = [
  { rank: 1,  name: 'Tyler Brooks',  handle: '@tbrooks',    pop: 4.9, rounds: 89,  trend: '+0.2', badge: '🥇' },
  { rank: 2,  name: 'Sophie Kim',    handle: '@sophiekim',  pop: 4.8, rounds: 74,  trend: '+0.3', badge: '🥈' },
  { rank: 3,  name: 'Marcus Webb',   handle: '@marcuswebb', pop: 4.8, rounds: 58,  trend: '+0.1', badge: '🥉' },
  { rank: 4,  name: 'Lena Park',     handle: '@lenapark',   pop: 4.7, rounds: 44,  trend: '+0.4', badge: null },
  { rank: 5,  name: 'Raj Patel',     handle: '@rajpatel',   pop: 4.3, rounds: 22,  trend: '0.0',  badge: null },
  { rank: 6,  name: 'Amy Chen',      handle: '@amychen',    pop: 3.9, rounds: 19,  trend: '+0.2', badge: null },
  { rank: 7,  name: 'Diego Flores',  handle: '@dflores',    pop: 4.1, rounds: 31,  trend: '-0.1', badge: null },
  { rank: 8,  name: 'Chris Lamont',  handle: '@clamot',     pop: 4.0, rounds: 27,  trend: '+0.1', badge: null },
  { rank: 9,  name: 'Nia Johnson',   handle: '@niajohnson', pop: 4.0, rounds: 36,  trend: '-0.2', badge: null },
  { rank: 10, name: 'Paul Nguyen',   handle: '@pnguyen',    pop: 3.9, rounds: 41,  trend: '+0.3', badge: null },
];

const FRIENDS = [
  { rank: 1,  name: 'Marcus Webb',  handle: '@marcuswebb', pop: 4.8, rounds: 58,  trend: '+0.1', badge: '🥇' },
  { rank: 2,  name: 'Lena Park',    handle: '@lenapark',   pop: 4.7, rounds: 44,  trend: '+0.4', badge: '🥈' },
  { rank: 3,  name: 'Jake (You)',   handle: '@jakeharmon', pop: 4.2, rounds: 12,  trend: '+0.3', badge: '🥉', isYou: true },
  { rank: 4,  name: 'Raj Patel',    handle: '@rajpatel',   pop: 4.3, rounds: 22,  trend: '0.0',  badge: null },
  { rank: 5,  name: 'Diego Flores', handle: '@dflores',    pop: 4.1, rounds: 31,  trend: '-0.1', badge: null },
  { rank: 6,  name: 'Amy Chen',     handle: '@amychen',    pop: 3.9, rounds: 19,  trend: '+0.2', badge: null },
];

const BY_COURSE = [
  { rank: 1, name: 'Sophie Kim',   handle: '@sophiekim',  course: 'TPC Sawgrass',  pop: 4.9, rounds: 12, badge: '🥇' },
  { rank: 2, name: 'Tyler Brooks', handle: '@tbrooks',    course: 'TPC Sawgrass',  pop: 4.7, rounds: 8,  badge: '🥈' },
  { rank: 3, name: 'Jake (You)',   handle: '@jakeharmon', course: 'TPC Sawgrass',  pop: 4.3, rounds: 3,  badge: '🥉', isYou: true },
  { rank: 4, name: 'Marcus Webb',  handle: '@marcuswebb', course: 'TPC Sawgrass',  pop: 4.2, rounds: 6,  badge: null },
  { rank: 5, name: 'Lena Park',    handle: '@lenapark',   course: 'TPC Sawgrass',  pop: 4.0, rounds: 4,  badge: null },
];

const FILTERS = ['GLOBAL', 'FRIENDS', 'BY COURSE'];

function popColor(score) {
  if (score >= 4.0) return '#7DC87A';
  if (score >= 3.0) return '#D4B86A';
  return '#C07A6A';
}

function trendColor(t) {
  if (t.startsWith('+')) return '#7DC87A';
  if (t.startsWith('-')) return '#C07A6A';
  return '#B8A882';
}

function TopThree({ entries }) {
  const [second, first, third] = [entries[1], entries[0], entries[2]];
  return (
    <View style={s.podium}>
      {/* 2nd */}
      <View style={[s.podiumItem, { marginTop: 24 }]}>
        <Text style={s.podiumBadge}>{second?.badge ?? '🥈'}</Text>
        <View style={[s.podiumAvatar, { borderColor: '#B8A882' }]}>
          <Text style={[s.podiumInitial, { color: '#B8A882' }]}>{second?.name[0]}</Text>
        </View>
        <Text style={s.podiumName} numberOfLines={1}>{second?.name.split(' ')[0]}</Text>
        <Text style={[s.podiumPop, { color: popColor(second?.pop) }]}>{second?.pop}</Text>
        <View style={[s.podiumBase, { height: 48, backgroundColor: '#B8A88222' }]}>
          <Text style={s.podiumRankText}>2</Text>
        </View>
      </View>

      {/* 1st */}
      <View style={s.podiumItem}>
        <Text style={s.podiumBadge}>{first?.badge ?? '🥇'}</Text>
        <View style={[s.podiumAvatar, { borderColor: '#C9A84C', width: 56, height: 56, borderRadius: 28 }]}>
          <Text style={[s.podiumInitial, { color: '#C9A84C', fontSize: 22 }]}>{first?.name[0]}</Text>
        </View>
        <Text style={s.podiumName} numberOfLines={1}>{first?.name.split(' ')[0]}</Text>
        <Text style={[s.podiumPop, { color: popColor(first?.pop), fontSize: 28 }]}>{first?.pop}</Text>
        <View style={[s.podiumBase, { height: 64, backgroundColor: '#C9A84C22' }]}>
          <Text style={[s.podiumRankText, { color: '#C9A84C' }]}>1</Text>
        </View>
      </View>

      {/* 3rd */}
      <View style={[s.podiumItem, { marginTop: 36 }]}>
        <Text style={s.podiumBadge}>{third?.badge ?? '🥉'}</Text>
        <View style={[s.podiumAvatar, { borderColor: '#D4B86A' }]}>
          <Text style={[s.podiumInitial, { color: '#D4B86A' }]}>{third?.name[0]}</Text>
        </View>
        <Text style={s.podiumName} numberOfLines={1}>{third?.name.split(' ')[0]}</Text>
        <Text style={[s.podiumPop, { color: popColor(third?.pop) }]}>{third?.pop}</Text>
        <View style={[s.podiumBase, { height: 36, backgroundColor: '#D4B86A22' }]}>
          <Text style={[s.podiumRankText, { color: '#D4B86A' }]}>3</Text>
        </View>
      </View>
    </View>
  );
}

function LeaderRow({ entry }) {
  const isYou = entry.isYou;
  return (
    <View style={[s.row, isYou && s.rowYou]}>
      <Text style={s.rowRank}>#{entry.rank}</Text>
      <View style={[s.rowAvatar, isYou && { borderColor: '#C9A84C' }]}>
        <Text style={[s.rowInitial, isYou && { color: '#C9A84C' }]}>{entry.name[0]}</Text>
      </View>
      <View style={s.rowInfo}>
        <Text style={[s.rowName, isYou && { color: '#C9A84C' }]}>{entry.name}</Text>
        <Text style={s.rowHandle}>{entry.handle} · {entry.rounds} rounds</Text>
      </View>
      <View style={s.rowRight}>
        <Text style={[s.rowPop, { color: popColor(entry.pop) }]}>{entry.pop}</Text>
        <Text style={[s.rowTrend, { color: trendColor(entry.trend) }]}>{entry.trend}</Text>
      </View>
    </View>
  );
}

export default function LeaderboardScreen() {
  const [filter, setFilter] = useState('GLOBAL');

  const data = filter === 'GLOBAL' ? GLOBAL : filter === 'FRIENDS' ? FRIENDS : BY_COURSE;
  const topThree = data.slice(0, 3);
  const rest = data.slice(3);

  return (
    <SafeAreaView style={s.container}>
      <View style={s.header}>
        <Text style={s.wordmark}>LEADERBOARD</Text>
        {filter === 'BY COURSE' && <Text style={s.courseTag}>TPC SAWGRASS</Text>}
      </View>

      <View style={s.filterRow}>
        {FILTERS.map(f => (
          <TouchableOpacity
            key={f}
            style={[s.filterBtn, filter === f && s.filterBtnActive]}
            onPress={() => setFilter(f)}
          >
            <Text style={[s.filterText, filter === f && s.filterTextActive]}>{f}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
        <TopThree entries={topThree} />

        <View style={s.listSection}>
          <Text style={s.sectionLabel}>RANKINGS</Text>
          {rest.map((entry, i) => <LeaderRow key={i} entry={entry} />)}
        </View>

        {filter === 'GLOBAL' && (
          <View style={s.yourRankCard}>
            <Text style={s.yourRankLabel}>YOUR GLOBAL RANK</Text>
            <Text style={s.yourRankValue}>#2,841</Text>
            <Text style={s.yourRankSub}>Top 18% of all players</Text>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container:        { flex: 1, backgroundColor: '#090F0A' },
  header:           { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 22, paddingTop: 16, paddingBottom: 12 },
  wordmark:         { fontSize: 11, fontWeight: '700', color: '#C9A84C', letterSpacing: 5 },
  courseTag:        { fontSize: 9, fontWeight: '700', color: '#C9A84C', letterSpacing: 2, backgroundColor: '#C9A84C22', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5 },
  filterRow:        { flexDirection: 'row', paddingHorizontal: 16, gap: 8, marginBottom: 8 },
  filterBtn:        { flex: 1, paddingVertical: 10, alignItems: 'center', borderRadius: 10, backgroundColor: '#0D1A0F', borderWidth: 1, borderColor: '#C9A84C22' },
  filterBtnActive:  { borderColor: '#C9A84C', backgroundColor: '#C9A84C22' },
  filterText:       { fontSize: 8, fontWeight: '700', color: '#B8A882', letterSpacing: 1 },
  filterTextActive: { color: '#C9A84C' },
  podium:           { flexDirection: 'row', justifyContent: 'center', alignItems: 'flex-end', paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8, gap: 10 },
  podiumItem:       { flex: 1, alignItems: 'center' },
  podiumBadge:      { fontSize: 20, marginBottom: 6 },
  podiumAvatar:     { width: 46, height: 46, borderRadius: 23, backgroundColor: '#0D1A0F', borderWidth: 2, alignItems: 'center', justifyContent: 'center', marginBottom: 6 },
  podiumInitial:    { fontSize: 18, fontWeight: '600' },
  podiumName:       { fontSize: 11, fontWeight: '600', color: '#F5EDD8', marginBottom: 2, textAlign: 'center' },
  podiumPop:        { fontSize: 22, fontWeight: '300', marginBottom: 6 },
  podiumBase:       { width: '100%', borderTopLeftRadius: 6, borderTopRightRadius: 6, alignItems: 'center', justifyContent: 'center' },
  podiumRankText:   { fontSize: 16, fontWeight: '700', color: '#B8A882' },
  listSection:      { paddingHorizontal: 16, paddingTop: 8 },
  sectionLabel:     { fontSize: 9, fontWeight: '700', color: '#C9A84C', letterSpacing: 2, marginBottom: 10 },
  row:              { flexDirection: 'row', alignItems: 'center', backgroundColor: '#0D1A0F', borderRadius: 14, borderWidth: 1, borderColor: '#C9A84C22', padding: 14, marginBottom: 8, gap: 10 },
  rowYou:           { borderColor: '#C9A84C44', backgroundColor: '#C9A84C0A' },
  rowRank:          { fontSize: 12, fontWeight: '700', color: '#B8A882', width: 28 },
  rowAvatar:        { width: 36, height: 36, borderRadius: 18, backgroundColor: '#C9A84C11', borderWidth: 1, borderColor: '#C9A84C33', alignItems: 'center', justifyContent: 'center' },
  rowInitial:       { fontSize: 14, fontWeight: '600', color: '#B8A882' },
  rowInfo:          { flex: 1 },
  rowName:          { fontSize: 14, fontWeight: '500', color: '#F5EDD8' },
  rowHandle:        { fontSize: 10, color: '#B8A88288', marginTop: 2 },
  rowRight:         { alignItems: 'flex-end' },
  rowPop:           { fontSize: 22, fontWeight: '300' },
  rowTrend:         { fontSize: 10, fontWeight: '600' },
  yourRankCard:     { margin: 16, backgroundColor: '#0D1A0F', borderRadius: 18, borderWidth: 1, borderColor: '#C9A84C44', padding: 24, alignItems: 'center' },
  yourRankLabel:    { fontSize: 9, fontWeight: '700', color: '#C9A84C', letterSpacing: 3, marginBottom: 8 },
  yourRankValue:    { fontSize: 42, fontWeight: '300', color: '#F5EDD8', marginBottom: 4 },
  yourRankSub:      { fontSize: 12, color: '#7DC87A', fontWeight: '600' },
});
