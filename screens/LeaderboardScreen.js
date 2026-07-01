import { useState, useRef, useCallback, useEffect } from 'react';
import { View, Text, ScrollView, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import SkeletonLoader from '../components/SkeletonLoader';
import CourseAvatar from '../components/CourseAvatar';
import InitialsAvatar from '../components/InitialsAvatar';
import { ClockedScoreCardCompact } from '../components/ClockedScoreCard';
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

// ─── Color helpers ───────────────────────────────────────────────────────────
function popColor(score) {
  if (score >= 4.0) return '#7DC87A';
  if (score >= 3.0) return '#D4B86A';
  return '#C07A6A';
}

function clockedColor(v) {
  if (v == null) return '#7A6E58';
  if (v >= 70) return '#7DC87A';
  if (v >= 40) return '#C9A84C';
  return '#B8A882';
}

// ─── Clocked Row (uses ClockedScoreCardCompact layout inline) ────────────────
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
          <Text style={s.rowSubStat}>G {entry.game != null ? Math.round(entry.game) : '\u2014'}</Text>
          <Text style={s.rowSubDot}>{'\u00B7'}</Text>
          <Text style={s.rowSubStat}>T {entry.teammate != null ? Math.round(entry.teammate) : '\u2014'}</Text>
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

// ─── Pace Row (existing) ─────────────────────────────────────────────────────
function PaceRow({ entry, navigation }) {
  const isYou = entry.isYou;
  const tappable = entry.courseData || (entry.userId && !isYou);
  const Wrapper = tappable ? TouchableOpacity : View;
  const onPress = entry.courseData
    ? () => navigation?.navigate('CourseProfile', { course: entry.courseData })
    : () => navigation?.navigate('PublicProfile', { userId: entry.userId });
  return (
    <Wrapper style={[s.row, isYou && s.rowYou]} onPress={tappable ? onPress : undefined} activeOpacity={0.8}>
      <Text style={s.rowRank}>#{entry.rank}</Text>
      <View style={[s.rowAvatar, isYou && { borderColor: '#C9A84C' }]}>
        {entry.isCourse
          ? <CourseAvatar courseName={entry.name} size={34} />
          : <InitialsAvatar name={entry.name} size={34} />
        }
      </View>
      <View style={s.rowInfo}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Text style={[s.rowName, isYou && { color: '#C9A84C' }]} numberOfLines={1}>{entry.name}</Text>
          {entry.isCaddy && <View style={s.caddyBadge}><Text style={s.caddyBadgeText}>CADDY</Text></View>}
        </View>
        <Text style={s.rowHandle}>{entry.handle}</Text>
      </View>
      <View style={s.rowRight}>
        <Text style={[s.rowScore, { color: popColor(entry.pop) }]}>{entry.pop?.toFixed(1) ?? '\u2014'}</Text>
      </View>
    </Wrapper>
  );
}

// ─── Ambassador Row ──────────────────────────────────────────────────────────
function AmbassadorRow({ entry, navigation }) {
  const tappable = entry.userId && !entry.isYou;
  const Wrapper = tappable ? TouchableOpacity : View;
  return (
    <Wrapper style={[s.row, entry.isYou && s.rowYou]}
      onPress={tappable ? () => navigation?.navigate('PublicProfile', { userId: entry.userId }) : undefined}
      activeOpacity={0.8}>
      <Text style={s.rowRank}>#{entry.rank}</Text>
      <View style={[s.rowAvatar, entry.isYou && { borderColor: '#C9A84C' }]}>
        <InitialsAvatar name={entry.name} size={34} avatarUrl={entry.avatarUrl} />
      </View>
      <View style={s.rowInfo}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Text style={[s.rowName, entry.isYou && { color: '#C9A84C' }]} numberOfLines={1}>{entry.name}</Text>
          <View style={s.ambassadorBadge}><Text style={s.ambassadorBadgeText}>AMB</Text></View>
        </View>
        <Text style={s.rowHandle}>
          {entry.roundsOperated} rounds operated {'\u00B7'} {entry.playersReferred} referred
        </Text>
      </View>
      <View style={s.rowRight}>
        <Text style={[s.rowScore, { color: '#C9A84C' }]}>{entry.score}</Text>
        <Text style={s.rowScoreLabel}>PTS</Text>
      </View>
    </Wrapper>
  );
}

// ─── Board configs ───────────────────────────────────────────────────────────
const CLOCKED_FILTERS = ['OVERALL', 'COURSE'];
const PACE_FILTERS    = ['GLOBAL', 'FRIENDS', 'COURSE', 'CADDIES'];

// ─── Main Screen ─────────────────────────────────────────────────────────────
export default function LeaderboardScreen({ navigation }) {
  const { session, profile } = useAuth();
  const uid = session?.user?.id ?? null;
  const isCaddy = profile?.account_type === 'caddy';

  const [board, setBoard]       = useState('CLOCKED');
  const [filter, setFilter]     = useState('OVERALL');
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState(false);
  const [data, setData]         = useState([]);
  const [myProjected, setMyProjected] = useState(null); // provisional user's projected rank
  const [myRank, setMyRank]     = useState(null);

  // Per-course selector state
  const [courseQuery, setCourseQuery]     = useState('');
  const [courseResults, setCourseResults] = useState([]);
  const [selectedCourse, setSelectedCourse] = useState(null);

  const filterRef = useRef(filter);
  filterRef.current = filter;
  const boardRef = useRef(board);
  boardRef.current = board;

  const switchBoard = (b) => {
    setBoard(b);
    setFilter(b === 'CLOCKED' ? 'OVERALL' : 'GLOBAL');
    setSelectedCourse(null);
    setCourseQuery('');
  };

  // ── Course search for per-course board ──
  useEffect(() => {
    if (filter !== 'COURSE' || courseQuery.trim().length < 2) { setCourseResults([]); return; }
    const t = setTimeout(async () => {
      const { data: courses } = await supabase
        .from('courses')
        .select('id, name, city, state')
        .ilike('name', `%${courseQuery.trim()}%`)
        .limit(10);
      setCourseResults(courses ?? []);
    }, 300);
    return () => clearTimeout(t);
  }, [courseQuery, filter]);

  // ── Fetch clocked boards ──
  const fetchClockedBoard = useCallback(async (sortKey, course) => {
    setLoading(true);
    setError(false);
    try {
      let query = supabase
        .from('rounds')
        .select('user_id, hole_scores, course_name')
        .eq('round_format', 'clocked')
        .eq('flagged', false)
        .not('hole_scores', 'is', null);

      if (sortKey === 'COURSE' && course) {
        query = query.eq('course_name', course.name);
      }

      const { data: clockedRounds, error: err } = await query;
      if (err) throw err;

      if (!clockedRounds?.length) { setData([]); setMyRank(null); setMyProjected(null); setLoading(false); return; }

      // Group by logger (user_id)
      const byUser = {};
      const roundMap = {};
      for (const r of clockedRounds) {
        if (!byUser[r.user_id]) byUser[r.user_id] = [];
        byUser[r.user_id].push(r);
        roundMap[r.id ?? ''] = r;
      }

      // Fetch confirmed participations to credit non-loggers
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

      // Merge: for each confirmed participant, add the round to their set
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

      // Compute ratings for all users
      const allEntries = userIds.map(userId => {
        const prof = profileMap[userId];
        const playerName = prof?.full_name || prof?.username || 'Player';
        const rounds = byUser[userId];
        const roundStats = rounds.map(r => {
          const key = r._playerKey ?? playerName;
          return extractPlayerRoundStats(r.hole_scores, key);
        }).filter(Boolean);
        const rating = computeFullRating({ roundStats, startedRounds: rounds.length, handicapIndex: prof?.handicap_index });
        return { userId, name: playerName, handle: prof?.username ? `@${prof.username}` : '', avatarUrl: prof?.avatar_url, rating, isYou: userId === uid };
      }).filter(e => e.rating.clockedScore != null);

      // Sort key
      const getKey = sortKey === 'GAME' ? 'game' : sortKey === 'TEAMMATE' ? 'teammate' : 'clockedScore';
      const getSortVal = (e) => e.rating[getKey] ?? 0;
      const sortLabel = sortKey === 'GAME' ? 'GAME' : sortKey === 'TEAMMATE' ? 'TEAM' : 'CLK';

      // Separate established from provisional
      const established = allEntries.filter(e => !e.rating.isProvisional);
      const provisional = allEntries.filter(e => e.rating.isProvisional);

      established.sort((a, b) => getSortVal(b) - getSortVal(a));

      // Ranked rows: only established players
      const rows = established.slice(0, 50).map((e, i) => ({
        rank: i + 1, userId: e.userId, name: e.name, handle: e.handle,
        sortVal: getSortVal(e), sortLabel,
        clockedScore: e.rating.clockedScore, game: e.rating.game, teammate: e.rating.teammate,
        roundsUsed: e.rating.roundsUsed, avatarUrl: e.avatarUrl, isYou: e.isYou,
      }));

      // My entry
      const myEstablished = rows.find(r => r.isYou);
      setMyRank(myEstablished?.rank ?? null);

      // Provisional projection for current user
      const myProv = provisional.find(e => e.isYou);
      if (myProv && !myEstablished) {
        const myVal = getSortVal(myProv);
        const ahead = established.filter(e => getSortVal(e) > myVal).length;
        setMyProjected({
          projectedRank: ahead + 1,
          roundsNeeded: myProv.rating.roundsNeeded,
          score: Math.round(myVal),
        });
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

  // ── Fetch pace boards (existing logic, unchanged) ──
  const fetchPaceBoard = useCallback(async (tab) => {
    setLoading(true);
    setError(false);
    setMyProjected(null);
    try {
      let rows = [];
      let rankVal = null;

      if (tab === 'GLOBAL') {
        const { data: profiles, error: err } = await supabase
          .from('profiles').select('id, full_name, username, pop_score')
          .eq('account_type', 'golfer').not('pop_score', 'is', null)
          .order('pop_score', { ascending: false }).limit(25);
        if (err) throw err;
        rows = (profiles || []).map((p, i) => ({
          rank: i + 1, userId: p.id, name: p.full_name || p.username || 'Player',
          handle: p.username ? `@${p.username}` : '', pop: p.pop_score, isYou: p.id === uid,
        }));
        if (uid) {
          const { data: me } = await supabase.from('profiles').select('pop_score').eq('id', uid).maybeSingle();
          if (me?.pop_score != null) {
            const { count } = await supabase.from('profiles').select('id', { count: 'exact', head: true })
              .eq('account_type', 'golfer').gt('pop_score', me.pop_score);
            rankVal = (count ?? 0) + 1;
          }
        }
      } else if (tab === 'FRIENDS') {
        if (!uid) { setData([]); setMyRank(null); setLoading(false); return; }
        const { data: follows } = await supabase.from('follows')
          .select('following_id, profiles!follows_following_id_fkey(id, full_name, username, pop_score)')
          .eq('follower_id', uid);
        const friends = (follows || []).map(f => f.profiles).filter(Boolean);
        const { data: me } = await supabase.from('profiles').select('id, full_name, username, pop_score').eq('id', uid).maybeSingle();
        const all = me ? [me, ...friends] : [...friends];
        all.sort((a, b) => (parseFloat(b.pop_score) || 0) - (parseFloat(a.pop_score) || 0));
        rows = all.map((p, i) => ({
          rank: i + 1, userId: p.id, name: p.full_name || p.username || 'Player',
          handle: p.username ? `@${p.username}` : '', pop: p.pop_score, isYou: p.id === uid,
        }));
        rankVal = rows.find(r => r.isYou)?.rank ?? null;
      } else if (tab === 'COURSE') {
        const { data: courseData } = await supabase.from('courses')
          .select('id, name, city, state, pop_score, total_rounds, avg_time')
          .gt('total_rounds', 0).not('pop_score', 'is', null)
          .order('pop_score', { ascending: false, nullsFirst: false }).limit(50);
        rows = (courseData || []).map((c, i) => ({
          rank: i + 1, name: c.name, isCourse: true, courseData: c,
          handle: [c.city, c.state].filter(Boolean).join(', ') + (c.total_rounds ? ` \u00B7 ${c.total_rounds} rounds` : ''),
          pop: parseFloat(c.pop_score), isYou: false,
        }));
      } else if (tab === 'CADDIES') {
        const { data: profiles } = await supabase.from('profiles')
          .select('id, full_name, username, caddy_rating, caddy_course')
          .eq('account_type', 'caddy').not('caddy_rating', 'is', null)
          .order('caddy_rating', { ascending: false }).limit(25);
        rows = (profiles || []).map((p, i) => ({
          rank: i + 1, userId: p.id, name: p.full_name || p.username || 'Caddy',
          handle: p.username ? `@${p.username}` : '', pop: p.caddy_rating,
          course: p.caddy_course, isYou: p.id === uid, isCaddy: true,
        }));
      }

      setData(rows);
      setMyRank(rankVal);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [uid]);

  // ── Fetch ambassador board ──
  const fetchAmbassadorBoard = useCallback(async () => {
    setLoading(true);
    setError(false);
    setMyProjected(null);
    try {
      // Count rounds operated per caddy
      const { data: caddyRounds } = await supabase
        .from('rounds')
        .select('caddy_id')
        .eq('round_format', 'clocked')
        .not('caddy_id', 'is', null);

      const roundCounts = {};
      (caddyRounds ?? []).forEach(r => { roundCounts[r.caddy_id] = (roundCounts[r.caddy_id] ?? 0) + 1; });

      // Fetch caddy profiles with referral stats
      const { data: caddies } = await supabase
        .from('profiles')
        .select('id, full_name, username, referral_count, caddy_course')
        .eq('account_type', 'caddy');

      const entries = (caddies ?? []).map(c => ({
        userId: c.id,
        name: c.full_name || c.username || 'Ambassador',
        handle: c.username ? `@${c.username}` : '',
        roundsOperated: roundCounts[c.id] ?? 0,
        playersReferred: c.referral_count ?? 0,
        course: c.caddy_course,
        score: (roundCounts[c.id] ?? 0) + (c.referral_count ?? 0), // activity score
        isYou: c.id === uid,
        isAmbassador: true,
      }));

      entries.sort((a, b) => b.score - a.score);
      const rows = entries.slice(0, 25).map((e, i) => ({ ...e, rank: i + 1 }));

      setData(rows);
      setMyRank(rows.find(r => r.isYou)?.rank ?? null);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [uid]);

  // ── Fetch dispatch ──
  const fetchForCurrentState = useCallback((f, c) => {
    if (board === 'CLOCKED') {
      if (f === 'AMBASS.') return fetchAmbassadorBoard();
      if (f === 'COURSE' && !c) return;
      return fetchClockedBoard(f, c);
    }
    return fetchPaceBoard(f);
  }, [board, fetchClockedBoard, fetchPaceBoard, fetchAmbassadorBoard]);

  useEffect(() => { fetchForCurrentState(filter, selectedCourse); }, [filter, board, selectedCourse]);
  useFocusEffect(useCallback(() => { fetchForCurrentState(filterRef.current, selectedCourse); }, []));

  useEffect(() => { if (!session) navigation.replace('Welcome'); }, [session]);

  const isEmpty = !loading && !error && data.length === 0;
  const isClocked = board === 'CLOCKED';
  const activeFilters = isClocked && !isCaddy ? CLOCKED_FILTERS : PACE_FILTERS;
  const showCourseSearch = isClocked && filter === 'COURSE';

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

      {/* Board switcher */}
      {!isCaddy && (
        <View style={s.boardRow}>
          {['CLOCKED', 'PACE'].map(b => (
            <TouchableOpacity key={b} style={[s.boardBtn, board === b && s.boardBtnActive]}
              onPress={() => switchBoard(b)} activeOpacity={0.7}>
              <Text style={[s.boardText, board === b && s.boardTextActive]}>{b}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {/* Sub-filters */}
      <View style={s.filterRow}>
        {activeFilters.map(f => (
          <TouchableOpacity key={f} style={[s.filterBtn, filter === f && s.filterBtnActive]}
            onPress={() => { setFilter(f); if (f !== 'COURSE') { setSelectedCourse(null); setCourseQuery(''); } }}>
            <Text style={[s.filterText, filter === f && s.filterTextActive]}>{f}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Course search (per-course clocked board) */}
      {showCourseSearch && (
        <View style={s.courseSearchWrap}>
          <TextInput
            style={s.courseSearchInput}
            placeholder="Search a course..."
            placeholderTextColor="#B8A88266"
            value={courseQuery}
            onChangeText={t => { setCourseQuery(t); setSelectedCourse(null); }}
            autoCapitalize="none"
            autoCorrect={false}
          />
          {courseResults.length > 0 && !selectedCourse && (
            <View style={s.courseDropdown}>
              {courseResults.map(c => (
                <TouchableOpacity key={c.id} style={s.courseDropdownRow}
                  onPress={() => { setSelectedCourse(c); setCourseQuery(c.name); setCourseResults([]); }}
                  activeOpacity={0.8}>
                  <Text style={s.courseDropdownName} numberOfLines={1}>{c.name}</Text>
                  {(c.city || c.state) && <Text style={s.courseDropdownSub}>{[c.city, c.state].filter(Boolean).join(', ')}</Text>}
                </TouchableOpacity>
              ))}
            </View>
          )}
          {selectedCourse && (
            <View style={s.courseSelectedChip}>
              <Text style={s.courseSelectedText}>{selectedCourse.name}</Text>
              <TouchableOpacity onPress={() => { setSelectedCourse(null); setCourseQuery(''); }} activeOpacity={0.7}>
                <Ionicons name="close-circle" size={16} color="#C9A84C" />
              </TouchableOpacity>
            </View>
          )}
        </View>
      )}

      {/* Content */}
      {loading ? (
        <LeaderboardSkeleton />
      ) : error ? (
        <View style={s.emptyState}>
          <Ionicons name="cloud-offline-outline" size={48} color="rgba(201,168,76,0.3)" style={{ marginBottom: 14 }} />
          <Text style={s.emptyText}>Could not load rankings.</Text>
          <TouchableOpacity style={s.ctaBtn} onPress={() => {
            if (isClocked) fetchClockedBoard(filter, selectedCourse);
            else fetchPaceBoard(filter);
          }} activeOpacity={0.8}>
            <Text style={s.ctaBtnText}>RETRY</Text>
          </TouchableOpacity>
        </View>
      ) : isEmpty ? (
        <View style={s.emptyState}>
          <Ionicons name="trophy-outline" size={56} color="rgba(201,168,76,0.2)" style={{ marginBottom: 18 }} />
          {isClocked ? (
            <>
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
            </>
          ) : (
            <>
              <Text style={s.emptyText}>
                {filter === 'FRIENDS' ? 'Follow players to see their rankings.' : 'No data yet.'}
              </Text>
              {filter === 'FRIENDS' && (
                <TouchableOpacity style={s.ctaBtn} onPress={() => navigation?.navigate('SearchUsers')} activeOpacity={0.8}>
                  <Text style={s.ctaBtnText}>FIND PLAYERS</Text>
                </TouchableOpacity>
              )}
            </>
          )}
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>

          {/* Your rank card */}
          {isClocked && myRank != null && (
            <View style={s.yourRankCard}>
              <Text style={s.yourRankLabel}>YOUR RANK</Text>
              <Text style={s.yourRankValue}>#{myRank}</Text>
            </View>
          )}

          {/* Provisional projection */}
          {isClocked && myProjected && (
            <View style={s.provCard}>
              <Text style={s.provCardLabel}>YOUR PROJECTED RANK</Text>
              <Text style={s.provCardValue}>~#{myProjected.projectedRank}</Text>
              <Text style={s.provCardHint}>
                Score: {myProjected.score} {'\u00B7'} Play {myProjected.roundsNeeded} more round{myProjected.roundsNeeded !== 1 ? 's' : ''} to rank officially
              </Text>
            </View>
          )}

          {!isClocked && myRank != null && (
            <View style={s.yourRankCard}>
              <Text style={s.yourRankLabel}>{filter === 'FRIENDS' ? 'YOUR RANK AMONG FRIENDS' : 'YOUR GLOBAL RANK'}</Text>
              <Text style={s.yourRankValue}>#{myRank}</Text>
            </View>
          )}

          {/* Rows */}
          <View style={s.listSection}>
            <Text style={s.sectionLabel}>RANKINGS</Text>
            {data.map((entry, i) => entry.isAmbassador
              ? <AmbassadorRow key={entry.userId ?? i} entry={entry} navigation={navigation} />
              : isClocked
              ? <ClockedRow key={entry.userId ?? i} entry={entry} navigation={navigation} />
              : <PaceRow key={entry.userId ?? entry.name + i} entry={entry} navigation={navigation} />
            )}
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

  // Board switcher
  boardRow:       { flexDirection: 'row', paddingHorizontal: 16, marginBottom: 8 },
  boardBtn:       { flex: 1, paddingVertical: 10, alignItems: 'center', borderBottomWidth: 2, borderBottomColor: 'transparent' },
  boardBtnActive: { borderBottomColor: '#C9A84C' },
  boardText:      { fontSize: 12, fontWeight: '700', color: '#7A6E58', letterSpacing: 2 },
  boardTextActive:{ color: '#C9A84C' },

  // Filters
  filterRow:       { flexDirection: 'row', paddingHorizontal: 16, gap: 6, marginBottom: 8 },
  filterBtn:       { flex: 1, paddingVertical: 8, alignItems: 'center', borderRadius: 8, backgroundColor: '#0D1A0F', borderWidth: 1, borderColor: '#7DC87A22' },
  filterBtnActive: { borderColor: '#C9A84C', backgroundColor: '#C9A84C22' },
  filterText:      { fontSize: 8, fontWeight: '700', color: '#B8A882', letterSpacing: 1 },
  filterTextActive:{ color: '#C9A84C' },

  // Course search
  courseSearchWrap:  { paddingHorizontal: 16, marginBottom: 8 },
  courseSearchInput: { backgroundColor: '#0D1A0F', borderWidth: 1, borderColor: '#7DC87A33', borderRadius: 10, padding: 10, color: '#F5EDD8', fontSize: 13 },
  courseDropdown:    { backgroundColor: '#0D1A0F', borderWidth: 1, borderColor: '#C9A84C33', borderRadius: 10, marginTop: 4, overflow: 'hidden' },
  courseDropdownRow: { padding: 10, borderBottomWidth: 1, borderBottomColor: '#7DC87A11' },
  courseDropdownName:{ fontSize: 13, fontWeight: '500', color: '#F5EDD8' },
  courseDropdownSub: { fontSize: 10, color: '#B8A882', marginTop: 2 },
  courseSelectedChip:{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6 },
  courseSelectedText:{ fontSize: 12, fontWeight: '600', color: '#C9A84C' },

  // Rows (shared)
  row:          { flexDirection: 'row', alignItems: 'center', backgroundColor: '#0D1A0F', borderRadius: 14, borderWidth: 1, borderColor: '#7DC87A22', padding: 14, marginBottom: 8, gap: 10 },
  rowYou:       { borderColor: '#C9A84C44', backgroundColor: '#C9A84C0A' },
  rowRank:      { fontSize: 12, fontWeight: '700', color: '#B8A882', width: 28 },
  rowAvatar:    { width: 36, height: 36, borderRadius: 18, backgroundColor: '#7DC87A11', borderWidth: 1, borderColor: '#7DC87A33', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  rowInfo:      { flex: 1 },
  rowName:      { fontSize: 14, fontWeight: '500', color: '#F5EDD8' },
  rowHandle:    { fontSize: 10, color: '#B8A88288', marginTop: 2 },
  rowRight:     { alignItems: 'flex-end', minWidth: 40 },
  rowScore:     { fontSize: 22, fontWeight: '300', fontVariant: ['tabular-nums'] },
  rowScoreLabel:{ fontSize: 7, fontWeight: '700', color: '#7A6E58', letterSpacing: 1, marginTop: 1 },

  // Clocked row sub-stats
  rowSubStats:  { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
  rowSubStat:   { fontSize: 10, fontWeight: '600', color: '#7A6E58' },
  rowSubDot:    { fontSize: 10, color: '#7A6E58' },
  rowRoundsLabel:{ fontSize: 9, color: '#7A6E5866' },

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

  // Caddy badge
  caddyBadge:    { backgroundColor: '#C9A84C', borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2 },
  caddyBadgeText:{ fontSize: 7, fontWeight: '700', color: '#090F0A', letterSpacing: 1.5 },
  ambassadorBadge:    { backgroundColor: '#7DC87A', borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2 },
  ambassadorBadgeText:{ fontSize: 7, fontWeight: '700', color: '#090F0A', letterSpacing: 1.5 },
});
