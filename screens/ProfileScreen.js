import { useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, SafeAreaView } from 'react-native';
import Gauge from '../components/guage';

const STATS = {
  pop: 4.2,
  trend: '+0.3',
  rounds: 47,
  roundsThisYear: 12,
  avgTime18: '3h 28m',
  avgTime9: '1h 41m',
  fastestRound: '3h 02m',
  slowestRound: '4h 44m',
  walkingPct: 34,
  cartPct: 66,
  nationalRank: 2841,
  fasterThan: 82,
};

const ROUNDS = [
  { course: 'TPC Sawgrass', date: 'Feb 28', holes: 18, time: '3h 22m', pop: 4.3, transport: 'Cart', players: 4, verified: true },
  { course: 'Pinehurst No. 2', date: 'Feb 14', holes: 18, time: '3h 45m', pop: 4.2, transport: 'Cart', players: 2, verified: true },
  { course: 'Pebble Beach', date: 'Jan 30', holes: 18, time: '3h 58m', pop: 3.9, transport: 'Walking', players: 4, verified: false },
  { course: 'TPC Sawgrass', date: 'Jan 12', holes: 18, time: '3h 31m', pop: 4.1, transport: 'Cart', players: 4, verified: true },
  { course: 'Pinehurst No. 2', date: 'Dec 28', holes: 9, time: '1h 48m', pop: 4.0, transport: 'Cart', players: 2, verified: true },
  { course: 'Medinah CC', date: 'Dec 10', holes: 18, time: '3h 55m', pop: 3.8, transport: 'Cart', players: 4, verified: true },
  { course: 'Riviera CC', date: 'Nov 22', holes: 18, time: '3h 48m', pop: 4.0, transport: 'Walking', players: 3, verified: false },
];

const FRIENDS = [
  { name: 'Marcus Webb', handle: '@marcuswebb', pop: 4.8, rounds: 58, trend: '+0.1', mutual: true },
  { name: 'Lena Park', handle: '@lenapark', pop: 4.7, rounds: 44, trend: '+0.4', mutual: true },
  { name: 'Diego Flores', handle: '@dflores', pop: 4.1, rounds: 31, trend: '-0.1', mutual: true },
  { name: 'Amy Chen', handle: '@amychen', pop: 3.9, rounds: 19, trend: '+0.2', mutual: false },
  { name: 'Raj Patel', handle: '@rajpatel', pop: 4.3, rounds: 22, trend: '0.0', mutual: false },
];

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

function StatTab() {
  return (
    <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
      <View style={s.gaugeCard}>
        <Gauge score={STATS.pop} />
        <View style={s.trendRow}>
          <Text style={s.trendLabel}>THIS SEASON</Text>
          <Text style={[s.trendValue, { color: popColor(STATS.pop) }]}>{STATS.trend}</Text>
        </View>
      </View>

      <View style={s.statSection}>
        <Text style={s.sectionLabel}>OVERVIEW</Text>
        <View style={s.statGrid}>
          <StatBox label="TOTAL ROUNDS" value={STATS.rounds} />
          <StatBox label="THIS YEAR" value={STATS.roundsThisYear} />
          <StatBox label="FASTER THAN" value={`${STATS.fasterThan}%`} />
          <StatBox label="NAT'L RANK" value={`#${STATS.nationalRank.toLocaleString()}`} />
        </View>
      </View>

      <View style={s.statSection}>
        <Text style={s.sectionLabel}>PACE AVERAGES</Text>
        <View style={s.infoCard}>
          <StatRow label="18 HOLES AVG" value={STATS.avgTime18} />
          <StatRow label="9 HOLES AVG" value={STATS.avgTime9} />
          <StatRow label="FASTEST ROUND" value={STATS.fastestRound} color="#7DC87A" />
          <StatRow label="SLOWEST ROUND" value={STATS.slowestRound} color="#C07A6A" last />
        </View>
      </View>

      <View style={s.statSection}>
        <Text style={s.sectionLabel}>TRANSPORT BREAKDOWN</Text>
        <View style={s.infoCard}>
          <View style={s.barRow}>
            <Text style={s.barLabel}>CART</Text>
            <View style={s.barTrack}>
              <View style={[s.barFill, { width: `${STATS.cartPct}%`, backgroundColor: '#C9A84C' }]} />
            </View>
            <Text style={s.barValue}>{STATS.cartPct}%</Text>
          </View>
          <View style={s.barRow}>
            <Text style={s.barLabel}>WALK</Text>
            <View style={s.barTrack}>
              <View style={[s.barFill, { width: `${STATS.walkingPct}%`, backgroundColor: '#7DC87A' }]} />
            </View>
            <Text style={s.barValue}>{STATS.walkingPct}%</Text>
          </View>
        </View>
      </View>
    </ScrollView>
  );
}

function StatBox({ label, value }) {
  return (
    <View style={s.statBox}>
      <Text style={s.statBoxLabel}>{label}</Text>
      <Text style={s.statBoxValue}>{value}</Text>
    </View>
  );
}

function StatRow({ label, value, color, last }) {
  return (
    <View style={[s.statRow, !last && s.statRowBorder]}>
      <Text style={s.statRowLabel}>{label}</Text>
      <Text style={[s.statRowValue, color && { color }]}>{value}</Text>
    </View>
  );
}

function RoundsTab() {
  return (
    <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 4, paddingBottom: 40 }}>
      <Text style={s.sectionLabel}>{ROUNDS.length} ROUNDS LOGGED</Text>
      {ROUNDS.map((r, i) => (
        <View key={i} style={s.roundCard}>
          <View style={s.roundTop}>
            <View style={s.roundInfo}>
              <Text style={s.roundCourse}>{r.course}</Text>
              <Text style={s.roundMeta}>{r.date} · {r.holes} holes · {r.transport} · {r.players}P</Text>
            </View>
            <View style={s.roundScoreCol}>
              <Text style={[s.roundPop, { color: popColor(r.pop) }]}>{r.pop}</Text>
              <Text style={s.roundTime}>{r.time}</Text>
            </View>
          </View>
          {r.verified && (
            <View style={s.verifiedBadge}>
              <Text style={s.verifiedText}>✓ VERIFIED</Text>
            </View>
          )}
        </View>
      ))}
    </ScrollView>
  );
}

function FriendsTab() {
  return (
    <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 4, paddingBottom: 40 }}>
      <Text style={s.sectionLabel}>{FRIENDS.length} FRIENDS</Text>
      {FRIENDS.map((f, i) => (
        <View key={i} style={s.friendCard}>
          <View style={s.friendAvatar}>
            <Text style={s.friendInitial}>{f.name[0]}</Text>
          </View>
          <View style={s.friendInfo}>
            <Text style={s.friendName}>{f.name}</Text>
            <Text style={s.friendHandle}>{f.handle} · {f.rounds} rounds</Text>
          </View>
          <View style={s.friendScore}>
            <Text style={[s.friendPop, { color: popColor(f.pop) }]}>{f.pop}</Text>
            <Text style={[s.friendTrend, { color: trendColor(f.trend) }]}>{f.trend}</Text>
          </View>
        </View>
      ))}
      <TouchableOpacity style={s.addFriendBtn}>
        <Text style={s.addFriendText}>+ ADD FRIENDS</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

export default function ProfileScreen() {
  const [tab, setTab] = useState('stats');
  return (
    <SafeAreaView style={s.container}>
      <View style={s.header}>
        <View>
          <Text style={s.wordmark}>PLAYTHRU</Text>
          <Text style={s.name}>Jake Harmon</Text>
          <Text style={s.handle}>@jakeharmon · Member since 2023</Text>
        </View>
        <View style={s.avatarLarge}>
          <Text style={s.avatarLargeText}>J</Text>
        </View>
      </View>

      <View style={s.tabBar}>
        {['stats', 'rounds', 'friends'].map(t => (
          <TouchableOpacity key={t} style={[s.tabBtn, tab === t && s.tabBtnActive]} onPress={() => setTab(t)}>
            <Text style={[s.tabBtnText, tab === t && s.tabBtnTextActive]}>{t.toUpperCase()}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {tab === 'stats' && <StatTab />}
      {tab === 'rounds' && <RoundsTab />}
      {tab === 'friends' && <FriendsTab />}
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container:        { flex: 1, backgroundColor: '#090F0A' },
  header:           { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', padding: 22, paddingTop: 16, borderBottomWidth: 1, borderBottomColor: '#C9A84C22' },
  wordmark:         { fontSize: 11, fontWeight: '700', color: '#C9A84C', letterSpacing: 5, marginBottom: 6 },
  name:             { fontSize: 22, fontWeight: '600', color: '#F5EDD8' },
  handle:           { fontSize: 11, color: '#B8A882', marginTop: 3 },
  avatarLarge:      { width: 52, height: 52, borderRadius: 26, backgroundColor: '#C9A84C22', borderWidth: 1, borderColor: '#C9A84C', alignItems: 'center', justifyContent: 'center' },
  avatarLargeText:  { fontSize: 22, fontWeight: '600', color: '#C9A84C' },
  tabBar:           { flexDirection: 'row', paddingHorizontal: 16, paddingVertical: 12, gap: 8 },
  tabBtn:           { flex: 1, paddingVertical: 10, alignItems: 'center', borderRadius: 10, backgroundColor: '#0D1A0F', borderWidth: 1, borderColor: '#C9A84C22' },
  tabBtnActive:     { borderColor: '#C9A84C', backgroundColor: '#C9A84C22' },
  tabBtnText:       { fontSize: 9, fontWeight: '700', color: '#B8A882', letterSpacing: 2 },
  tabBtnTextActive: { color: '#C9A84C' },
  gaugeCard:        { margin: 16, backgroundColor: '#0D1A0F', borderRadius: 20, padding: 24, borderWidth: 1, borderColor: '#C9A84C22', alignItems: 'center' },
  trendRow:         { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 },
  trendLabel:       { fontSize: 9, fontWeight: '700', color: '#C9A84C', letterSpacing: 2 },
  trendValue:       { fontSize: 16, fontWeight: '600' },
  statSection:      { paddingHorizontal: 16, marginBottom: 16 },
  sectionLabel:     { fontSize: 9, fontWeight: '700', color: '#C9A84C', letterSpacing: 2, marginBottom: 10 },
  statGrid:         { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  statBox:          { width: '47%', backgroundColor: '#0D1A0F', borderRadius: 14, borderWidth: 1, borderColor: '#C9A84C22', padding: 16, alignItems: 'center' },
  statBoxLabel:     { fontSize: 8, fontWeight: '700', color: '#C9A84C', letterSpacing: 1.5, marginBottom: 8, textAlign: 'center' },
  statBoxValue:     { fontSize: 26, fontWeight: '300', color: '#F5EDD8' },
  infoCard:         { backgroundColor: '#0D1A0F', borderRadius: 14, borderWidth: 1, borderColor: '#C9A84C22', overflow: 'hidden' },
  statRow:          { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 14 },
  statRowBorder:    { borderBottomWidth: 1, borderBottomColor: '#C9A84C11' },
  statRowLabel:     { fontSize: 9, fontWeight: '700', color: '#C9A84C', letterSpacing: 2 },
  statRowValue:     { fontSize: 15, fontWeight: '500', color: '#F5EDD8' },
  barRow:           { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14, gap: 10 },
  barLabel:         { fontSize: 9, fontWeight: '700', color: '#C9A84C', letterSpacing: 1, width: 32 },
  barTrack:         { flex: 1, height: 6, backgroundColor: '#C9A84C22', borderRadius: 3, overflow: 'hidden' },
  barFill:          { height: 6, borderRadius: 3 },
  barValue:         { fontSize: 12, color: '#B8A882', width: 36, textAlign: 'right' },
  roundCard:        { backgroundColor: '#0D1A0F', borderRadius: 14, borderWidth: 1, borderColor: '#C9A84C22', padding: 16, marginBottom: 10 },
  roundTop:         { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  roundInfo:        { flex: 1 },
  roundCourse:      { fontSize: 16, fontWeight: '600', color: '#F5EDD8', marginBottom: 4 },
  roundMeta:        { fontSize: 11, color: '#B8A882' },
  roundScoreCol:    { alignItems: 'flex-end' },
  roundPop:         { fontSize: 28, fontWeight: '300' },
  roundTime:        { fontSize: 11, color: '#B8A882' },
  verifiedBadge:    { marginTop: 10 },
  verifiedText:     { fontSize: 9, fontWeight: '700', color: '#7DC87A', letterSpacing: 1.5 },
  friendCard:       { flexDirection: 'row', alignItems: 'center', backgroundColor: '#0D1A0F', borderRadius: 14, borderWidth: 1, borderColor: '#C9A84C22', padding: 14, marginBottom: 10 },
  friendAvatar:     { width: 40, height: 40, borderRadius: 20, backgroundColor: '#C9A84C22', borderWidth: 1, borderColor: '#C9A84C44', alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  friendInitial:    { fontSize: 16, fontWeight: '600', color: '#C9A84C' },
  friendInfo:       { flex: 1 },
  friendName:       { fontSize: 15, fontWeight: '500', color: '#F5EDD8' },
  friendHandle:     { fontSize: 11, color: '#B8A882', marginTop: 2 },
  friendScore:      { alignItems: 'flex-end' },
  friendPop:        { fontSize: 24, fontWeight: '300' },
  friendTrend:      { fontSize: 11, fontWeight: '600' },
  addFriendBtn:     { borderWidth: 1, borderColor: '#C9A84C44', borderRadius: 14, borderStyle: 'dashed', paddingVertical: 18, alignItems: 'center', marginTop: 4 },
  addFriendText:    { fontSize: 11, fontWeight: '700', color: '#C9A84C', letterSpacing: 2 },
});
