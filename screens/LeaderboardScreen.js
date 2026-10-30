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
import { COLOR, SPACING, RADIUS } from '../lib/theme';

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

// ─── Podium (Top 3) ─────────────────────────────────────────────────────────
const PODIUM_SILVER = '#9CA3AF';
const PODIUM_BRONZE = '#CD7F32';

function TopThree({ entries, navigation }) {
  const first = entries[0];
  if (!first) return null;
  const second = entries[1];
  const third = entries[2];

  const renderSpot = (entry, rank, { color, avatarSize, baseHeight, marginTop }) => {
    if (!entry) return <View style={{ flex: 1 }} />;
    const tappable = entry.userId && !entry.isYou;
    return (
      <TouchableOpacity
        style={[s.podiumItem, { marginTop }]}
        onPress={tappable ? () => navigation?.navigate('PublicProfile', { userId: entry.userId }) : undefined}
        activeOpacity={tappable ? 0.8 : 1}
      >
        <Ionicons name="trophy" size={20} color={color} style={{ marginBottom: 6 }} />
        <View style={[s.podiumAvatar, { borderColor: color, width: avatarSize, height: avatarSize, borderRadius: avatarSize / 2 }]}>
          <InitialsAvatar name={entry.name} size={avatarSize - 2} avatarUrl={entry.avatarUrl} />
        </View>
        <Text style={s.podiumName} numberOfLines={1}>{entry.name.split(' ')[0]}</Text>
        <Text style={[s.podiumScore, { color: clockedColor(entry.sortVal) }]}>
          {entry.sortVal != null ? Math.round(entry.sortVal) : '\u2014'}
        </Text>
        {entries.length > 1 && (
          <View style={[s.podiumBase, { height: baseHeight, backgroundColor: color + '22' }]}>
            <Text style={[s.podiumRankText, { color }]}>{rank}</Text>
          </View>
        )}
      </TouchableOpacity>
    );
  };

  return (
    <View style={s.podium}>
      {renderSpot(second, 2, { color: PODIUM_SILVER, avatarSize: 46, baseHeight: 48, marginTop: 24 })}
      {renderSpot(first, 1, { color: COLOR.gold, avatarSize: 58, baseHeight: 64, marginTop: 0 })}
      {renderSpot(third, 3, { color: PODIUM_BRONZE, avatarSize: 46, baseHeight: 36, marginTop: 36 })}
    </View>
  );
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
          {entry.isProvisional && <Text style={s.rowProvBadge}>{'\u00B7'} PROV</Text>}
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

// ─── Tournament Standings Row ────────────────────────────────────────────────
function TournamentRow({ entry }) {
  return (
    <View style={s.courseRow}>
      <View style={s.rowAvatar}>
        <InitialsAvatar name={entry.name} size={34} avatarUrl={entry.avatarUrl} />
      </View>
      <View style={s.courseInfo}>
        <Text style={s.courseName} numberOfLines={1}>{entry.name}</Text>
        <Text style={s.courseMeta} numberOfLines={1}>
          {entry.division ? entry.division.toUpperCase() : ''}
          {entry.placement != null ? ` · #${entry.placement} PLACE` : ''}
        </Text>
      </View>
      <View style={s.courseRight}>
        <Text style={s.courseTime}>{entry.points ?? '—'}</Text>
        <Text style={s.courseRounds}>PTS</Text>
      </View>
    </View>
  );
}

// ─── Tournament Standings Empty State ────────────────────────────────────────
function TournamentEmptyState({ navigation }) {
  return (
    <View style={s.emptyState}>
      <Ionicons name="ribbon-outline" size={56} color="rgba(201,168,76,0.2)" style={{ marginBottom: 18 }} />
      <Text style={s.emptyTitle}>No tournaments completed yet.</Text>
      <Text style={s.emptyText}>
        This is where tournament results will live once the first Clocked event is played. It's coming to South Florida — request an invitation and be among the first on the board.
      </Text>
      <TouchableOpacity style={s.ctaBtn} onPress={() => navigation.navigate('Tournament')} activeOpacity={0.85}>
        <Ionicons name="trophy-outline" size={16} color="#090F0A" style={{ marginRight: 6 }} />
        <Text style={s.ctaBtnText}>ABOUT THE FIRST EVENT</Text>
      </TouchableOpacity>
    </View>
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
      <CourseAvatar courseName={course.name} city={course.city} size={44} />
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
const FILTERS = [
  { key: 'OVERALL',    label: 'OVERALL' },
  { key: 'COURSE',     label: 'COURSE' },
  { key: 'TOURNAMENT', label: 'STANDINGS' },
];

// Format/difficulty segments for the OVERALL board — "how well they play
// THIS format," not a re-sort of the same global list. Rounds carry a real
// `difficulty` column on the rounds table (default 'intermediate'), so this
// is computable today with zero new data collection.
const DIFFICULTIES = ['ALL', 'BEGINNER', 'INTERMEDIATE', 'PRO'];

// Division segments for Tournament Standings — mirrors tournament_results.division.
const DIVISIONS = ['ALL', 'BEGINNER', 'INTERMEDIATE', 'PRO', 'OPEN'];

// ─── Main Screen ─────────────────────────────────────────────────────────────
export default function LeaderboardScreen({ navigation }) {
  // Rendered inside the tab navigator (as "Ranks") or pushed on the root
  // stack (as "Leaderboard"). The tab instance's immediate navigator is the
  // tab navigator; the pushed instance's is the stack.
  const isTab = navigation.getState()?.type === 'tab';
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

  // Format/difficulty segment for OVERALL ('ALL' = today's behavior).
  const [difficulty, setDifficulty] = useState('ALL');

  // Division filter for TOURNAMENT standings (client-side).
  const [tournamentDivision, setTournamentDivision] = useState('ALL');

  const filterRef = useRef(filter);
  filterRef.current = filter;

  // ── Fetch player board (OVERALL) ──
  const fetchPlayerBoard = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const { data: allClockedRounds, error: err } = await supabase
        .from('rounds')
        .select('id, user_id, hole_scores, course_name, difficulty')
        .eq('round_format', 'clocked')
        .eq('flagged', false)
        .not('hole_scores', 'is', null);
      if (err) throw err;

      // Format filter: when a difficulty segment is selected, only rounds
      // actually logged at that difficulty count toward the score — this is
      // "how well they play THIS format," not a re-sort of the same board.
      const clockedRounds = difficulty === 'ALL'
        ? (allClockedRounds ?? [])
        : (allClockedRounds ?? []).filter(r => (r.difficulty ?? 'intermediate') === difficulty.toLowerCase());

      if (!clockedRounds.length) { setData([]); setMyRank(null); setMyProjected(null); setLoading(false); return; }

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

      // Only players with at least one clocked round are listed — on every
      // board, including OVERALL. Zero-round profiles used to be merged in
      // with the cold-start baseline score, which let people who had never
      // played tie at ~65 and take podium spots. A player who hasn't clocked
      // a round has no standing yet; they get the projected/provisional
      // treatment below instead of a rank.
      const combined = allEntries;

      const getSortVal = (e) => e.rating.clockedScore ?? 0;

      // Everyone with a score appears in the public list — provisional players
      // (fewer than 5 clocked rounds) get a full score per the doctrine and are
      // shown with a PROV marker, not hidden. Requiring 5+ rounds to even
      // appear made the board look near-empty while the clocked format is new.
      combined.sort((a, b) => getSortVal(b) - getSortVal(a));

      const rows = combined.slice(0, 50).map((e, i) => ({
        rank: i + 1, userId: e.userId, name: e.name, handle: e.handle,
        sortVal: getSortVal(e), sortLabel: 'CLK',
        clockedScore: e.rating.clockedScore, scoring: e.rating.scoring, clock: e.rating.clock,
        roundsUsed: e.rating.roundsUsed, isProvisional: e.rating.isProvisional,
        avatarUrl: e.avatarUrl, isYou: e.isYou,
      }));

      const mine = rows.find(r => r.isYou);
      setMyRank(mine?.rank ?? null);

      const myEntry = combined.find(e => e.isYou);
      if (mine?.isProvisional) {
        setMyProjected({ roundsNeeded: myEntry?.rating.roundsNeeded ?? 0 });
      } else if (!myEntry && uid && difficulty === 'ALL') {
        // Current user has no clocked rounds at all: unranked, show the
        // projected treatment with the full provisional requirement.
        const { roundsNeeded } = computeFullRating({ roundStats: [] });
        setMyProjected({ roundsNeeded });
      } else {
        setMyProjected(null);
      }

      setData(rows);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [uid, difficulty]);

  // ── Fetch course board ──
  // Computed LIVE from the `rounds` table (mirrors CourseProfileScreen's
  // per-course leaderboard) instead of the cached `courses.total_rounds` /
  // `avg_time` columns — those columns are only ever written by the
  // retired LiveRoundScreen flow, so a course only ever played through the
  // current ClockedRoundScreen flow would otherwise never appear here no
  // matter how many rounds get logged.
  const fetchCourseBoard = useCallback(async () => {
    setLoading(true);
    setError(false);
    setMyRank(null);
    setMyProjected(null);
    try {
      const { data: rounds, error: err } = await supabase
        .from('rounds')
        .select('course_name, duration_minutes')
        .eq('flagged', false)
        .not('course_name', 'is', null)
        .not('duration_minutes', 'is', null);
      if (err) throw err;

      // Group by course_name and average the real per-round duration —
      // the "pace" metric — instead of trusting a stale cached column.
      const byCourse = {};
      (rounds ?? []).forEach(r => {
        const key = r.course_name;
        if (!byCourse[key]) byCourse[key] = { total: 0, count: 0 };
        byCourse[key].total += Number(r.duration_minutes) || 0;
        byCourse[key].count += 1;
      });

      let courseBoard = Object.entries(byCourse)
        .map(([name, { total, count }]) => ({
          id: null, name, city: null, state: null,
          avg_time: total / count, total_rounds: count,
        }))
        .sort((a, b) => a.avg_time - b.avg_time)
        .slice(0, 50);

      // Enrich with courses table metadata (id/city/state) for display and
      // navigation — best-effort, matched by name; missing rows just fall
      // back to name-only (CourseProfileScreen already handles id == null).
      const names = courseBoard.map(c => c.name);
      if (names.length) {
        const { data: courseRows } = await supabase
          .from('courses')
          .select('id, name, city, state')
          .in('name', names);
        const meta = {};
        (courseRows ?? []).forEach(c => { meta[c.name] = c; });
        courseBoard = courseBoard.map(c => {
          const m = meta[c.name];
          return m ? { ...c, id: m.id, city: m.city, state: m.state } : c;
        });
      }

      setData(courseBoard);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  // ── Fetch tournament standings board ──
  // tournament_results is currently empty (no tournaments have completed
  // yet) — that's expected, the empty state below handles it. Query shape
  // matches the table exactly: id, tournament_id, user_id, team_name,
  // division, placement, points, created_at.
  const fetchTournamentBoard = useCallback(async () => {
    setLoading(true);
    setError(false);
    setMyRank(null);
    setMyProjected(null);
    try {
      const { data: results, error: err } = await supabase
        .from('tournament_results')
        .select('id, tournament_id, user_id, team_name, division, placement, points, created_at')
        .order('points', { ascending: false })
        .order('placement', { ascending: true });
      if (err) throw err;

      const userIds = [...new Set((results ?? []).map(r => r.user_id).filter(Boolean))];
      let profileMap = {};
      if (userIds.length) {
        const { data: profiles } = await supabase
          .from('profiles').select('id, full_name, username, avatar_url').in('id', userIds);
        (profiles ?? []).forEach(p => { profileMap[p.id] = p; });
      }

      const rows = (results ?? []).map((r, i) => {
        const prof = profileMap[r.user_id];
        const name = r.team_name || prof?.full_name || prof?.username || 'Player';
        return {
          id: r.id, rank: i + 1, name, division: r.division,
          placement: r.placement, points: r.points,
          avatarUrl: prof?.avatar_url, isYou: r.user_id === uid,
        };
      });
      setData(rows);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [uid]);

  // ── Fetch dispatch ──
  const fetchCurrent = useCallback(() => {
    if (filter === 'COURSE') fetchCourseBoard();
    else if (filter === 'TOURNAMENT') fetchTournamentBoard();
    else fetchPlayerBoard();
  }, [filter, fetchPlayerBoard, fetchCourseBoard, fetchTournamentBoard]);

  useEffect(() => { fetchCurrent(); }, [filter, difficulty]);
  useFocusEffect(useCallback(() => { fetchCurrent(); }, []));

  useEffect(() => { if (!session) navigation.replace('Welcome'); }, [session]);

  const isCourse = filter === 'COURSE';
  const isTournament = filter === 'TOURNAMENT';
  const isEmpty = !loading && !error && data.length === 0;

  // Client-side course filtering
  const filteredCourses = isCourse && courseQuery.length > 1
    ? data.filter(c =>
        c.name?.toLowerCase().includes(courseQuery.toLowerCase()) ||
        (c.city && c.city.toLowerCase().includes(courseQuery.toLowerCase()))
      )
    : data;

  // Client-side division filtering for tournament standings
  const filteredTournament = isTournament && tournamentDivision !== 'ALL'
    ? data.filter(r => (r.division || '').toUpperCase() === tournamentDivision)
    : data;

  return (
    <SafeAreaView style={s.container}>
      {/* Header */}
      <View style={s.header}>
        {/* This screen is both the Ranks tab and a pushed stack route. Only
            the pushed instance has somewhere to go back to. */}
        {isTab ? (
          <View style={{ width: 40 }} />
        ) : (
          <TouchableOpacity onPress={() => navigation.goBack()} style={{ width: 40, height: 40, justifyContent: 'center' }} activeOpacity={0.7}>
            <Ionicons name="arrow-back" size={20} color="#C9A84C" />
          </TouchableOpacity>
        )}
        <Text style={s.wordmark}>RANKINGS</Text>
        <View style={{ width: 40 }} />
      </View>

      {/* Filters */}
      <View style={s.filterRow}>
        {FILTERS.map(f => (
          <TouchableOpacity key={f.key} style={[s.filterBtn, filter === f.key && s.filterBtnActive]}
            onPress={() => { setFilter(f.key); setCourseQuery(''); setDifficulty('ALL'); setTournamentDivision('ALL'); }}>
            <Text style={[s.filterText, filter === f.key && s.filterTextActive]}>{f.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Format/difficulty segment — personalized rankings by how well a
          player performs a given format, not just their raw overall score */}
      {filter === 'OVERALL' && (
        <View style={s.diffRow}>
          {DIFFICULTIES.map(d => (
            <TouchableOpacity key={d} style={[s.diffPill, difficulty === d && s.diffPillActive]}
              onPress={() => setDifficulty(d)} activeOpacity={0.8}>
              <Text style={[s.diffPillText, difficulty === d && s.diffPillTextActive]}>{d}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

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

      {/* Division filter — only shown once there's tournament data to slice */}
      {isTournament && !loading && data.length > 0 && (
        <View style={s.diffRow}>
          {DIVISIONS.map(d => (
            <TouchableOpacity key={d} style={[s.diffPill, tournamentDivision === d && s.diffPillActive]}
              onPress={() => setTournamentDivision(d)} activeOpacity={0.8}>
              <Text style={[s.diffPillText, tournamentDivision === d && s.diffPillTextActive]}>{d}</Text>
            </TouchableOpacity>
          ))}
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
      ) : isEmpty && isTournament ? (
        <TournamentEmptyState navigation={navigation} />
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
      ) : isTournament ? (
        <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
          <Text style={s.courseListHeader}>Ranked by tournament points</Text>
          <View style={s.listSection}>
            {filteredTournament.map((entry, i) => (
              <TournamentRow key={entry.id ?? i} entry={entry} />
            ))}
            {filteredTournament.length === 0 && (
              <Text style={s.noResults}>No results in this division yet.</Text>
            )}
          </View>
        </ScrollView>
      ) : (
        <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
          {data.length >= 2 && <TopThree entries={data.slice(0, 3)} navigation={navigation} />}

          {myRank != null && (
            <View style={s.yourRankCard}>
              <Text style={s.yourRankLabel}>{difficulty === 'ALL' ? 'YOUR GLOBAL RANK' : `YOUR ${difficulty} RANK`}</Text>
              <Text style={s.yourRankValue}>#{myRank}</Text>
            </View>
          )}

          {myProjected && (
            <View style={s.provCard}>
              <Text style={s.provCardLabel}>PROVISIONAL RANK</Text>
              <Text style={s.provCardHint}>
                Play {myProjected.roundsNeeded} more round{myProjected.roundsNeeded !== 1 ? 's' : ''} to make it official
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
  container:     { flex: 1, backgroundColor: COLOR.bg },
  header:        { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: SPACING.lg, paddingTop: SPACING.sm, paddingBottom: SPACING.sm },
  // Same treatment as the Feed / Profile tab wordmarks — gold, tracked,
  // sans — so the tabs read as one app instead of one serif outlier.
  wordmark:      { fontSize: 13, fontWeight: '700', color: COLOR.gold, letterSpacing: 5 },

  // Filters
  filterRow:       { flexDirection: 'row', paddingHorizontal: SPACING.lg, gap: 6, marginBottom: SPACING.sm },
  filterBtn:       { flex: 1, paddingVertical: SPACING.sm, alignItems: 'center', borderRadius: RADIUS.sm, backgroundColor: COLOR.surface, borderWidth: 1, borderColor: COLOR.border },
  filterBtnActive: { borderColor: COLOR.gold, backgroundColor: '#C9A84C22' },
  filterText:      { fontSize: 8, fontWeight: '700', color: COLOR.muted, letterSpacing: 1 },
  filterTextActive:{ color: COLOR.gold },

  // Format/division segment pills
  diffRow:          { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: SPACING.lg, gap: 6, marginBottom: SPACING.sm },
  diffPill:         { paddingVertical: 6, paddingHorizontal: SPACING.md, borderRadius: RADIUS.sm, backgroundColor: COLOR.surface, borderWidth: 1, borderColor: COLOR.border },
  diffPillActive:   { borderColor: COLOR.gold, backgroundColor: '#C9A84C22' },
  diffPillText:     { fontSize: 8, fontWeight: '700', color: COLOR.muted, letterSpacing: 1 },
  diffPillTextActive: { color: COLOR.gold },

  // Course search
  courseSearchWrap:  { paddingHorizontal: SPACING.lg, marginBottom: SPACING.sm },
  courseSearchInput: { backgroundColor: COLOR.surface, borderWidth: 1, borderColor: '#7DC87A33', borderRadius: RADIUS.sm, padding: SPACING.sm, color: COLOR.cream, fontSize: 13 },

  // Podium
  podium:        { flexDirection: 'row', justifyContent: 'center', alignItems: 'flex-end', paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8, gap: 10 },
  podiumItem:    { flex: 1, alignItems: 'center' },
  podiumAvatar:  { borderWidth: 2, overflow: 'hidden', alignItems: 'center', justifyContent: 'center', marginBottom: 6 },
  podiumName:    { fontSize: 11, fontWeight: '600', color: COLOR.cream, textAlign: 'center', marginBottom: 2 },
  podiumScore:   { fontSize: 22, fontWeight: '300', fontVariant: ['tabular-nums'], marginBottom: 6 },
  podiumBase:    { width: '100%', borderRadius: 6, alignItems: 'center', justifyContent: 'center' },
  podiumRankText:{ fontSize: 16, fontWeight: '700' },

  // Player rows
  row:          { flexDirection: 'row', alignItems: 'center', backgroundColor: COLOR.surface, borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLOR.border, padding: SPACING.md, marginBottom: SPACING.sm, gap: 10 },
  rowYou:       { borderColor: '#C9A84C44', backgroundColor: '#C9A84C0A' },
  rowRank:      { fontSize: 12, fontWeight: '700', color: COLOR.muted, width: 28 },
  rowAvatar:    { width: 36, height: 36, borderRadius: 18, backgroundColor: '#7DC87A11', borderWidth: 1, borderColor: '#7DC87A33', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  rowInfo:      { flex: 1 },
  rowName:      { fontSize: 14, fontWeight: '500', color: COLOR.cream },
  rowRight:     { alignItems: 'flex-end', minWidth: 40 },
  rowScore:     { fontSize: 22, fontWeight: '300', fontVariant: ['tabular-nums'] },
  rowScoreLabel:{ fontSize: 7, fontWeight: '700', color: COLOR.dim, letterSpacing: 1, marginTop: 1 },
  rowSubStats:  { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
  rowSubStat:   { fontSize: 10, fontWeight: '600', color: COLOR.dim },
  rowSubDot:    { fontSize: 10, color: COLOR.dim },
  rowRoundsLabel:{ fontSize: 9, color: '#7A6E5866' },
  rowProvBadge: { fontSize: 9, fontWeight: '700', color: '#C9A84C88' },

  // Course + tournament rows
  courseRow:     { flexDirection: 'row', alignItems: 'center', backgroundColor: COLOR.surface, borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLOR.border, padding: SPACING.md, marginBottom: SPACING.sm },
  courseInfo:    { flex: 1, marginLeft: 2 },
  courseName:   { fontSize: 14, fontWeight: '600', color: COLOR.cream, marginBottom: 2 },
  courseMeta:   { fontSize: 11, color: COLOR.muted },
  courseRight:   { alignItems: 'flex-end', marginLeft: 8 },
  courseTime:    { fontSize: 18, fontWeight: '700', color: COLOR.gold, fontVariant: ['tabular-nums'] },
  courseRounds:  { fontSize: 10, color: COLOR.dim, marginTop: 2 },
  courseListHeader: { fontSize: 11, color: COLOR.dim, paddingHorizontal: SPACING.xl, paddingVertical: SPACING.md, letterSpacing: 1 },
  noResults:    { fontSize: 13, color: '#7A6E58', textAlign: 'center', paddingVertical: 20 },

  // Your rank
  yourRankCard:  { marginHorizontal: SPACING.lg, marginBottom: SPACING.sm, backgroundColor: COLOR.surface, borderRadius: RADIUS.lg, borderWidth: 1, borderColor: '#C9A84C44', paddingVertical: SPACING.md, paddingHorizontal: SPACING.lg, alignItems: 'center' },
  yourRankLabel: { fontSize: 9, fontWeight: '700', color: COLOR.gold, letterSpacing: 3, marginBottom: 4 },
  yourRankValue: { fontSize: 36, fontWeight: '300', color: COLOR.cream, fontVariant: ['tabular-nums'] },

  // Provisional projection
  provCard:      { marginHorizontal: SPACING.lg, marginBottom: SPACING.sm, backgroundColor: '#C9A84C0A', borderRadius: RADIUS.lg, borderWidth: 1, borderColor: COLOR.borderGold, paddingVertical: SPACING.md, paddingHorizontal: SPACING.lg, alignItems: 'center' },
  provCardLabel: { fontSize: 9, fontWeight: '700', color: COLOR.gold, letterSpacing: 3, marginBottom: 4 },
  provCardValue: { fontSize: 28, fontWeight: '300', color: COLOR.gold, fontVariant: ['tabular-nums'], marginBottom: 4 },
  provCardHint:  { fontSize: 11, color: COLOR.muted, textAlign: 'center', lineHeight: 16 },

  // List section
  listSection:   { paddingHorizontal: SPACING.lg, paddingTop: SPACING.sm },
  sectionLabel:  { fontSize: 9, fontWeight: '700', color: COLOR.gold, letterSpacing: 2, marginBottom: 10 },

  // Empty state
  emptyState:    { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 60, paddingHorizontal: 40 },
  emptyTitle:    { fontSize: 22, fontWeight: '600', color: COLOR.cream, textAlign: 'center', marginBottom: 10 },
  emptyText:     { fontSize: 15, color: COLOR.dim, textAlign: 'center', lineHeight: 22, marginBottom: 20 },
  ctaBtn:        { flexDirection: 'row', alignItems: 'center', backgroundColor: COLOR.gold, borderRadius: RADIUS.lg, paddingVertical: SPACING.md, paddingHorizontal: SPACING.xl },
  ctaBtnText:    { fontSize: 12, fontWeight: '700', color: COLOR.bg, letterSpacing: 2 },
});
