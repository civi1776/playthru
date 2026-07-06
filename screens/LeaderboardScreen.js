import { useState, useRef, useCallback, useEffect } from 'react';
import { View, Text, ScrollView, TextInput, TouchableOpacity, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import SkeletonLoader from '../components/SkeletonLoader';
import InitialsAvatar from '../components/InitialsAvatar';
import CourseAvatar from '../components/CourseAvatar';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { computeFullRating, extractPlayerRoundStats, DEFAULT_PROVISIONAL_ROUNDS } from '../lib/clockedRating';

// ─── Skeleton ────────────────────────────────────────────────────────────────
function LeaderboardSkeleton() {
  return (
    <ScrollView contentContainerStyle={{ paddingBottom: 40, paddingTop: 12 }}>
      <View style={{ paddingHorizontal: 16 }}>
        {[...Array(5)].map((_, i) => (
          <View key={i} style={{ backgroundColor: '#0D1A0F', borderRadius: 14, borderWidth: 1, borderColor: '#7DC87A22', padding: 14, marginBottom: 8, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <SkeletonLoader width={28} height={14} />
            <SkeletonLoader width={36} height={36} style={{ borderRadius: 18 }} />
            <View style={{ flex: 1, gap: 6 }}>
              <SkeletonLoader width="55%" height={14} />
              <SkeletonLoader width="40%" height={10} />
            </View>
            <SkeletonLoader width={36} height={28} />
          </View>
        ))}
      </View>
    </ScrollView>
  );
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
function clockedColor(v) {
  if (v == null) return '#7A6E58';
  if (v >= 70) return '#7DC87A';
  if (v >= 40) return '#C9A84C';
  return '#B8A882';
}

function formatAvgTime(minutes) {
  if (!minutes) return '\u2014';
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

// ─── Clocked Row ────────────────────────────────────────────────────────────
function ClockedRow({ entry, navigation }) {
  const isYou = entry.isYou;
  const tappable = entry.userId && !isYou;
  const Wrapper = tappable ? TouchableOpacity : View;
  return (
    <Wrapper
      style={[s.row, isYou && s.rowYou]}
      onPress={tappable ? () => navigation?.navigate('PublicProfile', { userId: entry.userId }) : undefined}
      activeOpacity={0.8}
    >
      <Text style={s.rowRank}>#{entry.rank}</Text>
      <View style={[s.rowAvatar, isYou && { borderColor: '#C9A84C' }]}>
        <InitialsAvatar name={entry.name} size={34} avatarUrl={entry.avatarUrl} />
      </View>
      <View style={s.rowInfo}>
        <Text style={[s.rowName, isYou && { color: '#C9A84C' }]} numberOfLines={1}>{entry.name}</Text>
        <View style={s.rowSubStats}>
          <Text style={s.rowSubStat}>S {entry.scoring != null ? Math.round(entry.scoring) : '\u2014'}</Text>
          <Text style={s.rowSubDot}>{'\u00B7'}</Text>
          <Text style={s.rowSubStat}>C {entry.clock != null ? Math.round(entry.clock) : '\u2014'}</Text>
          {entry.roundsUsed != null && <Text style={s.rowRoundsLabel}>{'\u00B7'} {entry.roundsUsed}r</Text>}
        </View>
      </View>
      <View style={s.rowRight}>
        <Text style={[s.rowScore, { color: clockedColor(entry.sortVal) }]}>
          {entry.sortVal != null ? Math.round(entry.sortVal) : '\u2014'}
        </Text>
        <Text style={s.rowScoreLabel}>{entry.sortLabel}</Text>
      </View>
    </Wrapper>
  );
}

// ─── Course Row ──────────────────────────────────────────────────────────────
function CourseRow({ course, navigation }) {
  return (
    <TouchableOpacity
      style={s.courseRow}
      onPress={() => navigation?.navigate('CourseProfile', { course: { id: course.id, name: course.name } })}
      activeOpacity={0.8}
    >
      <CourseAvatar courseName={course.name} size={44} />
      <View style={s.courseInfo}>
        <Text style={s.courseName} numberOfLines={1}>{course.name}</Text>
        <Text style={s.courseMeta}>{[course.city, course.state].filter(Boolean).join(', ')}</Text>
      </View>
      <View style={s.courseRight}>
        <Text style={s.courseTime}>{formatAvgTime(course.avg_time)}</Text>
        <Text style={s.courseRounds}>
          {course.total_rounds} {course.total_rounds === 1 ? 'round' : 'rounds'}
        </Text>
      </View>
    </TouchableOpacity>
  );
}

// ─── Filters ─────────────────────────────────────────────────────────────────
const FILTERS = ['OVERALL', 'COURSE'];

// ─── Main Screen ─────────────────────────────────────────────────────────────
export default function LeaderboardScreen({ navigation }) {
  const { session, profile } = useAuth();
  const uid = session?.user?.id ?? null;

  const [filter, setFilter]     = useState('OVERALL');
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState(false);
  const [data, setData]         = useState([]);
  const [myProjected, setMyProjected] = useState(null);
  const [myRank, setMyRank]     = useState(null);

  // Course filter search (client-side)
  const [courseQuery, setCourseQuery] = useState('');

  const filterRef = useRef(filter);
  filterRef.current = filter;

  // ── Fetch player board (OVERALL) ──
  const fetchPlayerBoard = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const { data: clockedRounds, error: err } = await supabase
        .from('rounds')
        .select('id, user_id, hole_scores, course_name')
        .eq('round_format', 'clocked')
        .eq('flagged', false)
        .not('hole_scores', 'is', null);
      if (err) throw err;

      if (!clockedRounds?.length) { setData([]); setMyRank(null); setMyProjected(null); setLoading(false); return; }

      const byUser = {};
      const roundMap = {};
      for (const r of clockedRounds) {
        if (!byUser[r.user_id]) byUser[r.user_id] = [];
        byUser[r.user_id].push(r);
        roundMap[r.id ?? ''] = r;
      }

      const roundIds = clockedRounds.map(r => r.id).filter(Boolean);
      let participations = [];
      if (roundIds.length) {
        const { data: parts } = await supabase
          .from('round_participants')
          .select('round_id, user_id, player_key, hole_scores, total_points')
          .eq('status', 'confirmed')
          .in('round_id', roundIds);
        participations = parts ?? [];
      }

      for (const p of participations) {
        if (!byUser[p.user_id]) byUser[p.user_id] = [];
        const already = byUser[p.user_id].some(r => (r.id ?? r.round_id) === p.round_id);
        if (!already && roundMap[p.round_id]) {
          byUser[p.user_id].push({ ...roundMap[p.round_id], _playerKey: p.player_key });
        }
      }

      const userIds = Object.keys(byUser);
      const { data: profiles } = await supabase
        .from('profiles').select('id, full_name, username, handicap_index, avatar_url').in('id', userIds);
      const profileMap = {};
      (profiles ?? []).forEach(p => { profileMap[p.id] = p; });

      const allEntries = userIds.map(userId => {
        const prof = profileMap[userId];
        const playerName = prof?.full_name || prof?.username || 'Player';
        const rounds = byUser[userId];
        const roundStats = rounds.map(r => {
          const key = r._playerKey ?? playerName;
          return extractPlayerRoundStats(r.hole_scores, key);
        }).filter(Boolean);
        const rating = computeFullRating({ roundStats, handicapIndex: prof?.handicap_index });
        return { userId, name: playerName, handle: prof?.username ? `@${prof.username}` : '', avatarUrl: prof?.avatar_url, rating, isYou: userId === uid };
      }).filter(e => e.rating.clockedScore != null && e.rating.clockedScore > 0);

      // Fetch all profiles so users with zero rounds still appear
      const { data: allProfiles } = await supabase
        .from('profiles').select('id, full_name, username, avatar_url, handicap_index')
        .eq('account_type', 'golfer').not('full_name', 'is', null);
      const entryUserIds = new Set(allEntries.map(e => e.userId));
      const baseEntries = (allProfiles ?? [])
        .filter(p => !entryUserIds.has(p.id))
        .map(p => {
          const rating = computeFullRating({ roundStats: [], handicapIndex: p.handicap_index });
          return { userId: p.id, name: p.full_name || p.username || 'Golfer', handle: p.username ? `@${p.username}` : '', avatarUrl: p.avatar_url, rating, isYou: p.id === uid };
        })
        .filter(e => e.rating.clockedScore != null && e.rating.clockedScore > 0);

      const combined = [...allEntries, ...baseEntries];

      const getSortVal = (e) => e.rating.clockedScore ?? 0;

      const established = combined.filter(e => !e.rating.isProvisional);
      const provisional = combined.filter(e => e.rating.isProvisional);
      established.sort((a, b) => getSortVal(b) - getSortVal(a));

      const rows = established.slice(0, 50).map((e, i) => ({
        rank: i + 1, userId: e.userId, name: e.name, handle: e.handle,
        sortVal: getSortVal(e), sortLabel: 'CLK',
        clockedScore: e.rating.clockedScore, scoring: e.rating.scoring, clock: e.rating.clock,
        roundsUsed: e.rating.roundsUsed, avatarUrl: e.avatarUrl, isYou: e.isYou,
      }));

      const myEstablished = rows.find(r => r.isYou);
      setMyRank(myEstablished?.rank ?? null);

      const myProv = provisional.find(e => e.isYou);
      if (myProv && !myEstablished) {
        const myVal = getSortVal(myProv);
        const ahead = established.filter(e => getSortVal(e) > myVal).length;
        setMyProjected({ projectedRank: ahead + 1, roundsNeeded: myProv.rating.roundsNeeded, score: Math.round(myVal) });
      } else {
        setMyProjected(null);
      }

      setData(rows);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [uid]);

  // ── Fetch course board ──
  const fetchCourseBoard = useCallback(async () => {
    setLoading(true);
    setError(false);
    setMyRank(null);
    setMyProjected(null);
    try {
      const { data: courses, error: err } = await supabase
        .from('courses')
        .select('id, name, city, state, avg_time, total_rounds, pop_score')
        .not('avg_time', 'is', null)
        .gt('total_rounds', 0)
        .order('avg_time', { ascending: true })
        .limit(50);
      if (err) throw err;
      setData(courses ?? []);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  // ── Fetch dispatch ──
  const fetchCurrent = useCallback(() => {
    if (filter === 'COURSE') fetchCourseBoard();
    else fetchPlayerBoard();
  }, [filter, fetchPlayerBoard, fetchCourseBoard]);

  useEffect(() => { fetchCurrent(); }, [filter]);
  useFocusEffect(useCallback(() => { fetchCurrent(); }, []));

  useEffect(() => { if (!session) navigation.replace('Welcome'); }, [session]);

  const isCourse = filter === 'COURSE';
  const isEmpty = !loading && !error && data.length === 0;

  // Client-side course filtering
  const filteredCourses = isCourse && courseQuery.length > 1
    ? data.filter(c =>
        c.name?.toLowerCase().includes(courseQuery.toLowerCase()) ||
        (c.city && c.city.toLowerCase().includes(courseQuery.toLowerCase()))
      )
    : data;

  return (
    <SafeAreaView style={s.container}>
      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={{ width: 40, height: 40, justifyContent: 'center' }} activeOpacity={0.7}>
          <Ionicons name="arrow-back" size={20} color="#C9A84C" />
        </TouchableOpacity>
        <Text style={s.wordmark}>RANKINGS</Text>
        <View style={{ width: 40 }} />
      </View>

      {/* Filters */}
      <View style={s.filterRow}>
        {FILTERS.map(f => (
          <TouchableOpacity key={f} style={[s.filterBtn, filter === f && s.filterBtnActive]}
            onPress={() => { setFilter(f); setCourseQuery(''); }}>
            <Text style={[s.filterText, filter === f && s.filterTextActive]}>{f}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Course search bar */}
      {isCourse && !loading && data.length > 0 && (
        <View style={s.courseSearchWrap}>
          <TextInput
            style={s.courseSearchInput}
            placeholder="Search courses..."
            placeholderTextColor="#7A6E58"
            value={courseQuery}
            onChangeText={setCourseQuery}
            autoCapitalize="none"
            autoCorrect={false}
          />
        </View>
      )}

      {/* Content */}
      {loading ? (
        <LeaderboardSkeleton />
      ) : error ? (
        <View style={s.emptyState}>
          <Ionicons name="cloud-offline-outline" size={48} color="rgba(201,168,76,0.3)" style={{ marginBottom: 14 }} />
          <Text style={s.emptyText}>Could not load rankings.</Text>
          <TouchableOpacity style={s.ctaBtn} onPress={fetchCurrent} activeOpacity={0.8}>
            <Text style={s.ctaBtnText}>RETRY</Text>
          </TouchableOpacity>
        </View>
      ) : isEmpty ? (
        <View style={s.emptyState}>
          <Ionicons name="trophy-outline" size={56} color="rgba(201,168,76,0.2)" style={{ marginBottom: 18 }} />
          <Text style={s.emptyTitle}>Be the first.</Text>
          <Text style={s.emptyText}>No one's ranked here yet. Play a round and claim the top spot.</Text>
          <TouchableOpacity style={s.ctaBtn} onPress={() => {
            const root = navigation.getParent();
            if (root) root.navigate('ClockedSetup');
            else navigation.navigate('ClockedSetup');
          }} activeOpacity={0.85}>
            <Ionicons name="timer-outline" size={16} color="#090F0A" style={{ marginRight: 6 }} />
            <Text style={s.ctaBtnText}>PLAY</Text>
          </TouchableOpacity>
        </View>
      ) : isCourse ? (
        <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
          <Text style={s.courseListHeader}>Courses ranked by fastest average round</Text>
          <View style={s.listSection}>
            {filteredCourses.map((course, i) => (
              <CourseRow key={course.id ?? i} course={course} navigation={navigation} />
            ))}
            {filteredCourses.length === 0 && courseQuery.length > 1 && (
              <Text style={s.noResults}>No courses match "{courseQuery}"</Text>
            )}
          </View>
        </ScrollView>
      ) : (
        <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
          {myRank != null && (
            <View style={s.yourRankCard}>
              <Text style={s.yourRankLabel}>YOUR GLOBAL RANK</Text>
              <Text style={s.yourRankValue}>#{myRank}</Text>
            </View>
          )}

          {myProjected && (
            <View style={s.provCard}>
              <Text style={s.provCardLabel}>YOUR PROJECTED RANK</Text>
              <Text style={s.provCardValue}>~#{myProjected.projectedRank}</Text>
              <Text style={s.provCardHint}>
                Score: {myProjected.score} {'\u00B7'} Play {myProjected.roundsNeeded} more round{myProjected.roundsNeeded !== 1 ? 's' : ''} to rank officially
              </Text>
            </View>
          )}

          <View style={s.listSection}>
            <Text style={s.sectionLabel}>RANKINGS</Text>
            {data.map((entry, i) => (
              <ClockedRow key={entry.userId ?? i} entry={entry} navigation={navigation} />
            ))}
          </View>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  container:     { flex: 1, backgroundColor: '#090F0A' },
  header:        { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 8, paddingBottom: 8 },
  wordmark:      { fontSize: 24, fontWeight: '300', color: '#F5EDD8', fontFamily: 'Georgia' },

  // Filters
  filterRow:       { flexDirection: 'row', paddingHorizontal: 16, gap: 6, marginBottom: 8 },
  filterBtn:       { flex: 1, paddingVertical: 8, alignItems: 'center', borderRadius: 8, backgroundColor: '#0D1A0F', borderWidth: 1, borderColor: '#7DC87A22' },
  filterBtnActive: { borderColor: '#C9A84C', backgroundColor: '#C9A84C22' },
  filterText:      { fontSize: 8, fontWeight: '700', color: '#B8A882', letterSpacing: 1 },
  filterTextActive:{ color: '#C9A84C' },

  // Course search
  courseSearchWrap:  { paddingHorizontal: 16, marginBottom: 8 },
  courseSearchInput: { backgroundColor: '#0D1A0F', borderWidth: 1, borderColor: '#7DC87A33', borderRadius: 10, padding: 10, color: '#F5EDD8', fontSize: 13 },

  // Player rows
  row:          { flexDirection: 'row', alignItems: 'center', backgroundColor: '#0D1A0F', borderRadius: 14, borderWidth: 1, borderColor: '#7DC87A22', padding: 14, marginBottom: 8, gap: 10 },
  rowYou:       { borderColor: '#C9A84C44', backgroundColor: '#C9A84C0A' },
  rowRank:      { fontSize: 12, fontWeight: '700', color: '#B8A882', width: 28 },
  rowAvatar:    { width: 36, height: 36, borderRadius: 18, backgroundColor: '#7DC87A11', borderWidth: 1, borderColor: '#7DC87A33', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  rowInfo:      { flex: 1 },
  rowName:      { fontSize: 14, fontWeight: '500', color: '#F5EDD8' },
  rowRight:     { alignItems: 'flex-end', minWidth: 40 },
  rowScore:     { fontSize: 22, fontWeight: '300', fontVariant: ['tabular-nums'] },
  rowScoreLabel:{ fontSize: 7, fontWeight: '700', color: '#7A6E58', letterSpacing: 1, marginTop: 1 },
  rowSubStats:  { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
  rowSubStat:   { fontSize: 10, fontWeight: '600', color: '#7A6E58' },
  rowSubDot:    { fontSize: 10, color: '#7A6E58' },
  rowRoundsLabel:{ fontSize: 9, color: '#7A6E5866' },

  // Course rows
  courseRow:     { flexDirection: 'row', alignItems: 'center', backgroundColor: '#0D1A0F', borderRadius: 14, borderWidth: 1, borderColor: '#7DC87A22', padding: 14, marginBottom: 8 },
  courseInfo:    { flex: 1, marginLeft: 2 },
  courseName:   { fontSize: 14, fontWeight: '600', color: '#F5EDD8', marginBottom: 2 },
  courseMeta:   { fontSize: 11, color: '#B8A882' },
  courseRight:   { alignItems: 'flex-end', marginLeft: 8 },
  courseTime:    { fontSize: 18, fontWeight: '700', color: '#C9A84C', fontVariant: ['tabular-nums'] },
  courseRounds:  { fontSize: 10, color: '#7A6E58', marginTop: 2 },
  courseListHeader: { fontSize: 11, color: '#7A6E58', paddingHorizontal: 20, paddingVertical: 12, letterSpacing: 1 },
  noResults:    { fontSize: 13, color: '#7A6E58', textAlign: 'center', paddingVertical: 20 },

  // Your rank
  yourRankCard:  { marginHorizontal: 16, marginBottom: 8, backgroundColor: '#0D1A0F', borderRadius: 16, borderWidth: 1, borderColor: '#C9A84C44', paddingVertical: 10, paddingHorizontal: 14, alignItems: 'center' },
  yourRankLabel: { fontSize: 9, fontWeight: '700', color: '#C9A84C', letterSpacing: 3, marginBottom: 4 },
  yourRankValue: { fontSize: 36, fontWeight: '300', color: '#F5EDD8', fontVariant: ['tabular-nums'] },

  // Provisional projection
  provCard:      { marginHorizontal: 16, marginBottom: 8, backgroundColor: '#C9A84C0A', borderRadius: 16, borderWidth: 1, borderColor: '#C9A84C33', paddingVertical: 12, paddingHorizontal: 16, alignItems: 'center' },
  provCardLabel: { fontSize: 9, fontWeight: '700', color: '#C9A84C', letterSpacing: 3, marginBottom: 4 },
  provCardValue: { fontSize: 28, fontWeight: '300', color: '#C9A84C', fontVariant: ['tabular-nums'], marginBottom: 4 },
  provCardHint:  { fontSize: 11, color: '#B8A882', textAlign: 'center', lineHeight: 16 },

  // List section
  listSection:   { paddingHorizontal: 16, paddingTop: 8 },
  sectionLabel:  { fontSize: 9, fontWeight: '700', color: '#C9A84C', letterSpacing: 2, marginBottom: 10 },

  // Empty state
  emptyState:    { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 60, paddingHorizontal: 40 },
  emptyTitle:    { fontSize: 22, fontWeight: '600', color: '#F5EDD8', textAlign: 'center', marginBottom: 10 },
  emptyText:     { fontSize: 15, color: '#7A6E58', textAlign: 'center', lineHeight: 22, marginBottom: 20 },
  ctaBtn:        { flexDirection: 'row', alignItems: 'center', backgroundColor: '#C9A84C', borderRadius: 12, paddingVertical: 12, paddingHorizontal: 24 },
  ctaBtnText:    { fontSize: 12, fontWeight: '700', color: '#090F0A', letterSpacing: 2 },
});
