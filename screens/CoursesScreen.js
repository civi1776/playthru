import { useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, TextInput, StyleSheet, SafeAreaView } from 'react-native';

const COURSES = [
  { id: 1, name: 'TPC Sawgrass', location: 'Ponte Vedra Beach, FL', par: 72, holes: 18, avgPop: 4.1, yourPop: 4.3, rounds: 847, yourRounds: 3 },
  { id: 2, name: 'Augusta National', location: 'Augusta, GA', par: 72, holes: 18, avgPop: 4.4, yourPop: null, rounds: 312, yourRounds: 0 },
  { id: 3, name: 'Pebble Beach', location: 'Pebble Beach, CA', par: 72, holes: 18, avgPop: 3.8, yourPop: 3.9, rounds: 1204, yourRounds: 1 },
  { id: 4, name: 'Pinehurst No. 2', location: 'Pinehurst, NC', par: 70, holes: 18, avgPop: 4.0, yourPop: 4.2, rounds: 693, yourRounds: 2 },
  { id: 5, name: 'Bethpage Black', location: 'Farmingdale, NY', par: 71, holes: 18, avgPop: 3.5, yourPop: 3.6, rounds: 988, yourRounds: 1 },
  { id: 6, name: 'Torrey Pines', location: 'La Jolla, CA', par: 72, holes: 18, avgPop: 3.9, yourPop: null, rounds: 1541, yourRounds: 0 },
  { id: 7, name: 'Riviera CC', location: 'Pacific Palisades, CA', par: 71, holes: 18, avgPop: 4.2, yourPop: 4.0, rounds: 421, yourRounds: 1 },
  { id: 8, name: 'Winged Foot', location: 'Mamaroneck, NY', par: 72, holes: 18, avgPop: 3.7, yourPop: null, rounds: 256, yourRounds: 0 },
  { id: 9, name: 'Medinah CC', location: 'Medinah, IL', par: 72, holes: 18, avgPop: 4.0, yourPop: 3.8, rounds: 374, yourRounds: 2 },
  { id: 10, name: 'Oakland Hills', location: 'Bloomfield Hills, MI', par: 70, holes: 18, avgPop: 3.6, yourPop: null, rounds: 189, yourRounds: 0 },
];

const LEADERBOARD = [
  { rank: 1, name: 'Marcus Webb', pop: 4.8, rounds: 34, badge: '🏆' },
  { rank: 2, name: 'Lena Park', pop: 4.7, rounds: 28, badge: null },
  { rank: 3, name: 'Jake (You)', pop: 4.3, rounds: 3, badge: null },
  { rank: 4, name: 'Diego Flores', pop: 4.1, rounds: 19, badge: null },
  { rank: 5, name: 'Amy Chen', pop: 3.9, rounds: 11, badge: null },
];

function popColor(score) {
  if (score >= 4.0) return '#7DC87A';
  if (score >= 3.0) return '#D4B86A';
  return '#C07A6A';
}

function CourseDetail({ course, onBack }) {
  const [tab, setTab] = useState('info');
  return (
    <SafeAreaView style={s.container}>
      <View style={s.detailHeader}>
        <TouchableOpacity onPress={onBack} style={s.backBtn}>
          <Text style={s.backBtnText}>← COURSES</Text>
        </TouchableOpacity>
      </View>
      <ScrollView>
        <View style={s.detailHero}>
          <Text style={s.detailName}>{course.name}</Text>
          <Text style={s.detailLocation}>{course.location}</Text>
          <View style={s.detailMeta}>
            <View style={s.metaChip}><Text style={s.metaChipText}>PAR {course.par}</Text></View>
            <View style={s.metaChip}><Text style={s.metaChipText}>{course.holes} HOLES</Text></View>
            <View style={s.metaChip}><Text style={s.metaChipText}>{course.rounds} ROUNDS LOGGED</Text></View>
          </View>
        </View>

        <View style={s.tabRow}>
          {['info', 'leaderboard', 'your rounds'].map(t => (
            <TouchableOpacity key={t} style={[s.tab, tab === t && s.tabActive]} onPress={() => setTab(t)}>
              <Text style={[s.tabText, tab === t && s.tabTextActive]}>{t.toUpperCase()}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {tab === 'info' && (
          <View style={s.tabContent}>
            <View style={s.statGrid}>
              <View style={s.statBox}>
                <Text style={s.statBoxLabel}>AVG POPSCORE</Text>
                <Text style={[s.statBoxValue, { color: popColor(course.avgPop) }]}>{course.avgPop}</Text>
              </View>
              <View style={s.statBox}>
                <Text style={s.statBoxLabel}>YOUR BEST</Text>
                <Text style={[s.statBoxValue, { color: course.yourPop ? popColor(course.yourPop) : '#B8A882' }]}>
                  {course.yourPop ?? '—'}
                </Text>
              </View>
            </View>
            <View style={s.infoCard}>
              <Text style={s.infoCardLabel}>PACE PROFILE</Text>
              <Text style={s.infoCardText}>
                Rounds at {course.name} average {Math.floor(3.5 + Math.random())}h {Math.floor(Math.random() * 30 + 15)}m for 18 holes.
                {course.avgPop >= 4.0 ? ' Known for excellent pace management.' : ' Pace can vary significantly by tee time.'}
              </Text>
            </View>
            <View style={s.infoCard}>
              <Text style={s.infoCardLabel}>BEST TIME TO PLAY</Text>
              <Text style={s.infoCardText}>Early morning tee times (before 8AM) consistently produce the fastest rounds.</Text>
            </View>
          </View>
        )}

        {tab === 'leaderboard' && (
          <View style={s.tabContent}>
            <Text style={s.sectionLabel}>TOP PACE PLAYERS</Text>
            {LEADERBOARD.map(p => (
              <View key={p.rank} style={[s.leaderRow, p.name.includes('You') && s.leaderRowYou]}>
                <Text style={s.leaderRank}>#{p.rank}</Text>
                <View style={s.leaderInfo}>
                  <Text style={[s.leaderName, p.name.includes('You') && { color: '#C9A84C' }]}>
                    {p.badge} {p.name}
                  </Text>
                  <Text style={s.leaderRounds}>{p.rounds} rounds</Text>
                </View>
                <Text style={[s.leaderPop, { color: popColor(p.pop) }]}>{p.pop}</Text>
              </View>
            ))}
          </View>
        )}

        {tab === 'your rounds' && (
          <View style={s.tabContent}>
            {course.yourRounds === 0 ? (
              <View style={s.emptyState}>
                <Text style={s.emptyIcon}>⛳</Text>
                <Text style={s.emptyText}>You haven't logged any rounds here yet.</Text>
              </View>
            ) : (
              <>
                <Text style={s.sectionLabel}>YOUR ROUNDS</Text>
                {Array.from({ length: course.yourRounds }, (_, i) => (
                  <View key={i} style={s.roundRow}>
                    <View>
                      <Text style={s.roundDate}>{['Feb 28', 'Jan 14', 'Dec 3'][i]}</Text>
                      <Text style={s.roundDetail}>18 holes · Cart · {['3h 22m', '3h 45m', '4h 01m'][i]}</Text>
                    </View>
                    <View style={s.roundBadge}>
                      <Text style={[s.roundPop, { color: popColor(course.yourPop) }]}>{course.yourPop}</Text>
                    </View>
                  </View>
                ))}
              </>
            )}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

export default function CoursesScreen() {
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState(null);

  if (selected) return <CourseDetail course={selected} onBack={() => setSelected(null)} />;

  const filtered = COURSES.filter(c =>
    c.name.toLowerCase().includes(query.toLowerCase()) ||
    c.location.toLowerCase().includes(query.toLowerCase())
  );

  return (
    <SafeAreaView style={s.container}>
      <View style={s.header}>
        <Text style={s.wordmark}>COURSES</Text>
      </View>
      <View style={s.searchWrapper}>
        <TextInput
          style={s.searchInput}
          placeholder="Search courses..."
          placeholderTextColor="#B8A88266"
          value={query}
          onChangeText={setQuery}
        />
      </View>
      <ScrollView contentContainerStyle={{ paddingBottom: 20 }}>
        <Text style={s.sectionLabel2}>{filtered.length} COURSES</Text>
        {filtered.map(course => (
          <TouchableOpacity key={course.id} style={s.courseCard} onPress={() => setSelected(course)}>
            <View style={s.courseTop}>
              <View style={s.courseInfo}>
                <Text style={s.courseName}>{course.name}</Text>
                <Text style={s.courseLocation}>{course.location}</Text>
              </View>
              <View style={s.courseScore}>
                <Text style={[s.coursePopValue, { color: popColor(course.avgPop) }]}>{course.avgPop}</Text>
                <Text style={s.coursePopLabel}>AVG</Text>
              </View>
            </View>
            <View style={s.courseMeta}>
              <Text style={s.courseMetaText}>Par {course.par} · {course.rounds} rounds</Text>
              {course.yourRounds > 0 && (
                <Text style={s.courseYours}>✓ {course.yourRounds} round{course.yourRounds > 1 ? 's' : ''} logged</Text>
              )}
            </View>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container:        { flex: 1, backgroundColor: '#090F0A' },
  header:           { paddingHorizontal: 22, paddingTop: 16, paddingBottom: 12 },
  wordmark:         { fontSize: 11, fontWeight: '700', color: '#C9A84C', letterSpacing: 5 },
  searchWrapper:    { paddingHorizontal: 16, marginBottom: 8 },
  searchInput:      { backgroundColor: '#0D1A0F', borderWidth: 1, borderColor: '#C9A84C22', borderRadius: 14, padding: 14, color: '#F5EDD8', fontSize: 15 },
  sectionLabel2:    { fontSize: 9, fontWeight: '700', color: '#C9A84C', letterSpacing: 2, paddingHorizontal: 22, marginBottom: 10, marginTop: 4 },
  courseCard:       { marginHorizontal: 16, marginBottom: 10, backgroundColor: '#0D1A0F', borderRadius: 16, padding: 18, borderWidth: 1, borderColor: '#C9A84C22' },
  courseTop:        { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 },
  courseInfo:       { flex: 1 },
  courseName:       { fontSize: 17, fontWeight: '600', color: '#F5EDD8', marginBottom: 3 },
  courseLocation:   { fontSize: 12, color: '#B8A882' },
  courseScore:      { alignItems: 'center', marginLeft: 12 },
  coursePopValue:   { fontSize: 26, fontWeight: '300' },
  coursePopLabel:   { fontSize: 8, fontWeight: '700', color: '#C9A84C', letterSpacing: 2 },
  courseMeta:       { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  courseMetaText:   { fontSize: 11, color: '#B8A88288' },
  courseYours:      { fontSize: 10, fontWeight: '600', color: '#7DC87A' },
  // Detail
  detailHeader:     { paddingHorizontal: 22, paddingTop: 16, paddingBottom: 8 },
  backBtn:          { alignSelf: 'flex-start' },
  backBtnText:      { fontSize: 11, fontWeight: '700', color: '#C9A84C', letterSpacing: 2 },
  detailHero:       { paddingHorizontal: 22, paddingTop: 8, paddingBottom: 24, borderBottomWidth: 1, borderBottomColor: '#C9A84C22' },
  detailName:       { fontSize: 26, fontWeight: '600', color: '#F5EDD8', marginBottom: 6 },
  detailLocation:   { fontSize: 13, color: '#B8A882', marginBottom: 14 },
  detailMeta:       { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  metaChip:         { backgroundColor: '#C9A84C22', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5 },
  metaChipText:     { fontSize: 9, fontWeight: '700', color: '#C9A84C', letterSpacing: 1.5 },
  tabRow:           { flexDirection: 'row', paddingHorizontal: 16, paddingTop: 16, gap: 8 },
  tab:              { flex: 1, paddingVertical: 10, alignItems: 'center', borderRadius: 10, backgroundColor: '#0D1A0F', borderWidth: 1, borderColor: '#C9A84C22' },
  tabActive:        { borderColor: '#C9A84C', backgroundColor: '#C9A84C22' },
  tabText:          { fontSize: 8, fontWeight: '700', color: '#B8A882', letterSpacing: 1 },
  tabTextActive:    { color: '#C9A84C' },
  tabContent:       { padding: 16 },
  statGrid:         { flexDirection: 'row', gap: 12, marginBottom: 16 },
  statBox:          { flex: 1, backgroundColor: '#0D1A0F', borderRadius: 14, borderWidth: 1, borderColor: '#C9A84C22', padding: 18, alignItems: 'center' },
  statBoxLabel:     { fontSize: 8, fontWeight: '700', color: '#C9A84C', letterSpacing: 2, marginBottom: 8 },
  statBoxValue:     { fontSize: 36, fontWeight: '300' },
  infoCard:         { backgroundColor: '#0D1A0F', borderRadius: 14, borderWidth: 1, borderColor: '#C9A84C22', padding: 16, marginBottom: 10 },
  infoCardLabel:    { fontSize: 9, fontWeight: '700', color: '#C9A84C', letterSpacing: 2, marginBottom: 8 },
  infoCardText:     { fontSize: 13, color: '#B8A882', lineHeight: 20 },
  sectionLabel:     { fontSize: 9, fontWeight: '700', color: '#C9A84C', letterSpacing: 2, marginBottom: 12 },
  leaderRow:        { flexDirection: 'row', alignItems: 'center', backgroundColor: '#0D1A0F', borderRadius: 12, borderWidth: 1, borderColor: '#C9A84C22', padding: 14, marginBottom: 8 },
  leaderRowYou:     { borderColor: '#C9A84C44', backgroundColor: '#C9A84C0A' },
  leaderRank:       { fontSize: 13, fontWeight: '700', color: '#B8A882', width: 32 },
  leaderInfo:       { flex: 1 },
  leaderName:       { fontSize: 15, fontWeight: '500', color: '#F5EDD8' },
  leaderRounds:     { fontSize: 11, color: '#B8A88288', marginTop: 2 },
  leaderPop:        { fontSize: 24, fontWeight: '300' },
  roundRow:         { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#0D1A0F', borderRadius: 12, borderWidth: 1, borderColor: '#C9A84C22', padding: 16, marginBottom: 8 },
  roundDate:        { fontSize: 15, fontWeight: '500', color: '#F5EDD8', marginBottom: 3 },
  roundDetail:      { fontSize: 11, color: '#B8A882' },
  roundBadge:       { alignItems: 'center' },
  roundPop:         { fontSize: 26, fontWeight: '300' },
  emptyState:       { alignItems: 'center', paddingVertical: 48 },
  emptyIcon:        { fontSize: 40, marginBottom: 16 },
  emptyText:        { fontSize: 14, color: '#B8A882', textAlign: 'center' },
});
