import { useState, useRef, useCallback, useEffect } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import SkeletonLoader from '../components/SkeletonLoader';
import InitialsAvatar from '../components/InitialsAvatar';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { computeFullRating, extractPlayerRoundStats, DEFAULT_PROVISIONAL_ROUNDS } from '../lib/clockedRating';
import { COLOR, SPACING, RADIUS } from '../lib/theme';
import ScreenHeader from '../components/ScreenHeader';
import ArcadeBoardRow from '../components/arcade/ArcadeBoardRow';
import { fetchArcadeBoard, seasonLabel, currentSeason, daysLeftInSeason, QUALIFY_TOP } from '../lib/arcade/season';

// ─── Skeleton ────────────────────────────────────────────────────────────────
function LeaderboardSkeleton() {
  return (
    <ScrollView contentContainerStyle={{ paddingBottom: 40, paddingTop: 12 }}>
      <View style={{ paddingHorizontal: 16 }}>
        {[...Array(5)].map((_, i) => (
          <View key={i} style={{ backgroundColor: COLOR.surface, borderRadius: RADIUS.md, borderWidth: 1, borderColor: '#7DC87A22', padding: 14, marginBottom: 8, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <SkeletonLoader width={28} height={14} />
            <SkeletonLoader width={36} height={36} style={{ borderRadius: RADIUS.lg }} />
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
  if (v == null) return COLOR.dim;
  if (v >= 70) return COLOR.green;
  if (v >= 40) return COLOR.gold;
  return COLOR.muted;
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
      <View style={[s.rowAvatar, isYou && { borderColor: COLOR.gold }]}>
        <InitialsAvatar name={entry.name} size={34} avatarUrl={entry.avatarUrl} />
      </View>
      <View style={s.rowInfo}>
        <Text style={[s.rowName, isYou && { color: COLOR.gold }]} numberOfLines={1}>{entry.name}</Text>
        <View style={s.rowSubStats}>
          {entry.isLegacy ? (
            <Text style={s.rowSubStat}>Legacy{entry.roundsUsed != null ? ` · ${entry.roundsUsed} round${entry.roundsUsed === 1 ? '' : 's'}` : ''}</Text>
          ) : (
            <>
              <Text style={s.rowSubStat}>Scoring {entry.scoring != null ? Math.round(entry.scoring) : '\u2014'}</Text>
              <Text style={s.rowSubDot}>{'\u00B7'}</Text>
              <Text style={s.rowSubStat}>Clock {entry.clock != null ? Math.round(entry.clock) : '\u2014'}</Text>
              {entry.roundsUsed != null && <Text style={s.rowRoundsLabel}>{'\u00B7'} {entry.roundsUsed} round{entry.roundsUsed === 1 ? '' : 's'}</Text>}
              {entry.isProvisional && <Text style={s.rowProvBadge}>{'\u00B7'} PROVISIONAL</Text>}
            </>
          )}
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

// ─── Filters ─────────────────────────────────────────────────────────────────
// Two boards. CLOCKED is the real thing: one score, one ranking. ARCADE is
// the game, with the level on every row. Courses are not ranked against each
// other: a course either runs Clocked tee times or it does not.
const FILTERS = [
  { key: 'CLOCKED', label: 'CLOCKED' },
  { key: 'ARCADE',  label: 'ARCADE' },
];
const ARCADE_PERIODS = [['month', 'THIS MONTH'], ['all', 'ALL TIME']];
// The month board defaults to the qualifying slice (intermediate + pro),
// because that is the one that leads to the event; all-time defaults to all.
const ARCADE_DIFFS = {
  month: [['qualifying', 'QUALIFYING'], ['beginner', 'BEGINNER'], ['intermediate', 'INTER'], ['pro', 'PRO']],
  all:   [['all', 'ALL'], ['beginner', 'BEGINNER'], ['intermediate', 'INTER'], ['pro', 'PRO']],
};

// ─── Main Screen ─────────────────────────────────────────────────────────────
export default function LeaderboardScreen({ navigation }) {
  // Rendered inside the tab navigator (as "Ranks") or pushed on the root
  // stack (as "Leaderboard"). The tab instance's immediate navigator is the
  // tab navigator; the pushed instance's is the stack.
  const isTab = navigation.getState()?.type === 'tab';
  const { session, profile } = useAuth();
  const uid = session?.user?.id ?? null;

  const [filter, setFilter]     = useState('CLOCKED');
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState(false);
  const [data, setData]         = useState([]);
  const [myProjected, setMyProjected] = useState(null);
  const [myRank, setMyRank]     = useState(null);


  // The Clocked board is one board. Rounds at every difficulty feed one
  // score, so there is nothing to slice; the constant keeps the legacy-round
  // merge below on its ALL path.
  const difficulty = 'ALL';

  // Arcade board slices.
  const [arcadePeriod, setArcadePeriod] = useState('month');
  const [arcadeDiff, setArcadeDiff] = useState('qualifying');

  const filterRef = useRef(filter);
  filterRef.current = filter;
  // Last rendered rows: a refetch on focus only shows the skeleton when there
  // is nothing on screen yet, so tab switches stop flashing.
  const dataRef = useRef([]);
  dataRef.current = data;

  // ── Fetch player board (OVERALL) ──
  const fetchPlayerBoard = useCallback(async () => {
    setLoading(prev => prev && dataRef.current.length === 0 ? true : dataRef.current.length === 0);
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

      // Legacy (pre-clock) rounds. Until Clocked rounds outnumber them, players
      // with only legacy rounds are ranked on their stored score (0..5 → 0..100)
      // and tagged LEGACY, so the board shows the community that actually
      // exists instead of a single name. Only on the ALL segment: legacy rounds
      // have no difficulty.
      const legacyByUser = {};
      if (difficulty === 'ALL') {
        const { data: legacyRounds } = await supabase
          .from('rounds')
          .select('user_id, pop_score')
          .eq('round_format', 'pace')
          .eq('flagged', false)
          .not('pop_score', 'is', null);
        for (const r of legacyRounds ?? []) {
          if (byUser[r.user_id]) continue;             // has Clocked rounds: those rule
          (legacyByUser[r.user_id] ??= []).push(Number(r.pop_score));
        }
      }

      const userIds = [...new Set([...Object.keys(byUser), ...Object.keys(legacyByUser)])];
      if (!userIds.length) { setData([]); setMyRank(null); setMyProjected({ roundsNeeded: computeFullRating({ roundStats: [] }).roundsNeeded, hasRounds: false }); setLoading(false); return; }
      const { data: profiles } = await supabase
        .from('profiles').select('id, full_name, username, handicap_index, avatar_url').in('id', userIds);
      const profileMap = {};
      (profiles ?? []).forEach(p => { profileMap[p.id] = p; });

      const allEntries = userIds.map(userId => {
        const prof = profileMap[userId];
        const playerName = prof?.full_name || prof?.username || 'Player';
        if (!byUser[userId]) {
          const scores = legacyByUser[userId];
          const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
          const rating = { clockedScore: Math.round(avg * 20), scoring: null, clock: null, roundsUsed: scores.length, isProvisional: false, roundsNeeded: 0 };
          return { userId, name: playerName, handle: prof?.username ? `@${prof.username}` : '', avatarUrl: prof?.avatar_url, rating, isYou: userId === uid, isLegacy: true };
        }
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
        roundsUsed: e.rating.roundsUsed, isProvisional: e.rating.isProvisional, isLegacy: !!e.isLegacy,
        avatarUrl: e.avatarUrl, isYou: e.isYou,
      }));

      const mine = rows.find(r => r.isYou);
      setMyRank(mine?.rank ?? null);

      const myEntry = combined.find(e => e.isYou);
      if (mine?.isProvisional) {
        setMyProjected({ roundsNeeded: myEntry?.rating.roundsNeeded ?? 0, hasRounds: true });
      } else if ((!myEntry || myEntry.isLegacy) && uid && difficulty === 'ALL') {
        // No Clocked rounds yet (legacy only, or none): say what it takes.
        const { roundsNeeded } = computeFullRating({ roundStats: [] });
        setMyProjected({ roundsNeeded, hasRounds: false });
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

  // ── Fetch arcade board ──
  const fetchArcadeBoardData = useCallback(async () => {
    setLoading(dataRef.current.length === 0);
    setError(false);
    setMyProjected(null);
    try {
      const rows = await fetchArcadeBoard({ period: arcadePeriod, difficulty: arcadeDiff, limit: 50 });
      setData(rows.map(r => ({ ...r, isYou: r.user_id === uid })));
      setMyRank(rows.find(r => r.user_id === uid)?.rank ?? null);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [uid, arcadePeriod, arcadeDiff]);

  // ── Fetch dispatch ──
  const fetchCurrent = useCallback(() => {
    if (filter === 'ARCADE') fetchArcadeBoardData();
    else fetchPlayerBoard();
  }, [filter, fetchPlayerBoard, fetchArcadeBoardData]);

  useEffect(() => { fetchCurrent(); }, [filter, arcadePeriod, arcadeDiff]);
  useFocusEffect(useCallback(() => { fetchCurrent(); }, []));

  useEffect(() => { if (!session) navigation.replace('Welcome'); }, [session]);

  const isArcade = filter === 'ARCADE';
  const isEmpty = !loading && !error && data.length === 0;

  return (
    <SafeAreaView style={s.container}>
      {/* Header */}
      {/* This screen is both the Ranks tab and a pushed stack route. Only
          the pushed instance has somewhere to go back to. */}
      {isTab
        ? <ScreenHeader title="RANKINGS" />
        : <ScreenHeader title="RANKINGS" onBack={() => navigation.goBack()} borderless />}

      {/* Filters */}
      <View style={s.filterRow}>
        {FILTERS.map(f => (
          <TouchableOpacity key={f.key} style={[s.filterBtn, filter === f.key && s.filterBtnActive]}
            onPress={() => setFilter(f.key)} accessibilityRole="tab" accessibilityState={{ selected: filter === f.key }}>
            <Text style={[s.filterText, filter === f.key && s.filterTextActive]}>{f.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Arcade slices: period, then level. The level is never implicit. */}
      {isArcade && (
        <>
          <View style={s.diffRow}>
            {ARCADE_PERIODS.map(([k, l]) => (
              <TouchableOpacity key={k} style={[s.diffPill, arcadePeriod === k && s.diffPillActive]}
                onPress={() => { setArcadePeriod(k); setArcadeDiff(k === 'month' ? 'qualifying' : 'all'); }} activeOpacity={0.8}>
                <Text style={[s.diffPillText, arcadePeriod === k && s.diffPillTextActive]}>{l}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <View style={s.diffRow}>
            {ARCADE_DIFFS[arcadePeriod].map(([k, l]) => (
              <TouchableOpacity key={k} style={[s.diffPill, arcadeDiff === k && s.diffPillActive]}
                onPress={() => setArcadeDiff(k)} activeOpacity={0.8}>
                <Text style={[s.diffPillText, arcadeDiff === k && s.diffPillTextActive]}>{l}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </>
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
      ) : isEmpty && isArcade ? (
        <View style={s.emptyState}>
          <Ionicons name="game-controller-outline" size={56} color="rgba(201,168,76,0.2)" style={{ marginBottom: 18 }} />
          <Text style={s.emptyTitle}>Nothing on this board yet.</Text>
          <Text style={s.emptyText}>
            {arcadeDiff === 'qualifying'
              ? 'Play nine on intermediate or pro and you are first on the qualifying board.'
              : 'Play nine at this level and you are first.'}
          </Text>
          <TouchableOpacity style={s.ctaBtn} onPress={() => navigation.navigate('Arcade')} activeOpacity={0.85}>
            <Ionicons name="game-controller-outline" size={16} color={COLOR.bg} style={{ marginRight: 6 }} />
            <Text style={s.ctaBtnText}>PLAY NINE</Text>
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
            <Ionicons name="timer-outline" size={16} color={COLOR.bg} style={{ marginRight: 6 }} />
            <Text style={s.ctaBtnText}>PLAY</Text>
          </TouchableOpacity>
        </View>
      ) : isArcade ? (
        <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
          <Text style={s.courseListHeader}>
            {arcadePeriod === 'month' ? `${seasonLabel(currentSeason())} \u00B7 best nine per player` : 'All time \u00B7 best nine per player'}
            {arcadeDiff === 'qualifying' ? ` \u00B7 intermediate and pro \u00B7 ${daysLeftInSeason()} days left` : ''}
          </Text>
          {arcadePeriod === 'month' && arcadeDiff === 'qualifying' && (
            <Text style={s.glossaryWide}>Top {QUALIFY_TOP} at month end earn a spot in the first Clocked event's qualifier.</Text>
          )}
          {myRank != null && (
            <View style={s.yourRankCard}>
              <Text style={s.yourRankLabel}>{arcadeDiff === 'qualifying' ? 'YOUR QUALIFYING RANK' : 'YOUR RANK ON THIS BOARD'}</Text>
              <Text style={s.yourRankValue}>#{myRank}</Text>
            </View>
          )}
          <View style={s.listSection}>
            <View style={s.boardCard}>
              {data.map((row, i) => {
                const cut = arcadePeriod === 'month' && arcadeDiff === 'qualifying' && row.rank === QUALIFY_TOP && data.length > QUALIFY_TOP;
                return (
                  <View key={row.id ?? i}>
                    <ArcadeBoardRow row={row} isYou={row.isYou} last={i === data.length - 1 || cut}
                      onPress={row.isYou ? undefined : () => navigation.navigate('PublicProfile', { userId: row.user_id })} />
                    {cut && <View style={s.cutLine}><Text style={s.cutText}>QUALIFYING LINE</Text></View>}
                  </View>
                );
              })}
            </View>
          </View>
        </ScrollView>
      ) : (
        <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
          {data.length >= 2 && <TopThree entries={data.slice(0, 3)} navigation={navigation} />}

          {myRank != null && (
            <View style={s.yourRankCard}>
              <Text style={s.yourRankLabel}>YOUR CLOCKED RANK</Text>
              <Text style={s.yourRankValue}>#{myRank}</Text>
            </View>
          )}

          {myProjected && (
            <View style={s.provCard}>
              <Text style={s.provCardLabel}>{myProjected.hasRounds ? 'PROVISIONAL RANK' : 'NOT RANKED YET'}</Text>
              <Text style={s.provCardHint}>
                {myProjected.hasRounds
                  ? `Play ${myProjected.roundsNeeded} more Clocked round${myProjected.roundsNeeded !== 1 ? 's' : ''} to make it official`
                  : `Play ${myProjected.roundsNeeded} Clocked rounds to get ranked`}
              </Text>
            </View>
          )}

          <View style={s.listSection}>
            <Text style={s.sectionLabel}>CLOCKED SCORE RANKINGS</Text>
            <Text style={s.glossary}>Real rounds on the clock. CLK is the Clocked Score, 0 to 100. Legacy rows are pre-clock rounds.</Text>
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
  // Same treatment as the Feed / Profile tab wordmarks — gold, tracked,
  // sans — so the tabs read as one app instead of one serif outlier.
  glossary:      { fontSize: 11, color: COLOR.dim, marginTop: -4, marginBottom: 10, lineHeight: 15 },
  glossaryWide:  { fontSize: 11, color: COLOR.dim, paddingHorizontal: SPACING.xl, marginTop: -6, marginBottom: 8, lineHeight: 15 },
  boardCard:     { backgroundColor: COLOR.surface, borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLOR.border, overflow: 'hidden' },
  cutLine:       { alignItems: 'center', paddingVertical: 6, backgroundColor: '#C9A84C12', borderTopWidth: 1, borderBottomWidth: 1, borderColor: '#C9A84C55' },
  cutText:       { fontSize: 8, fontWeight: '800', color: COLOR.gold, letterSpacing: 2 },

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


  // Podium
  podium:        { flexDirection: 'row', justifyContent: 'center', alignItems: 'flex-end', paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8, gap: 10 },
  podiumItem:    { flex: 1, alignItems: 'center' },
  podiumAvatar:  { borderWidth: 2, overflow: 'hidden', alignItems: 'center', justifyContent: 'center', marginBottom: 6 },
  podiumName:    { fontSize: 11, fontWeight: '600', color: COLOR.cream, textAlign: 'center', marginBottom: 2 },
  podiumScore:   { fontSize: 22, fontWeight: '300', fontVariant: ['tabular-nums'], marginBottom: 6 },
  podiumBase:    { width: '100%', borderRadius: RADIUS.xs, alignItems: 'center', justifyContent: 'center' },
  podiumRankText:{ fontSize: 16, fontWeight: '700' },

  // Player rows
  row:          { flexDirection: 'row', alignItems: 'center', backgroundColor: COLOR.surface, borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLOR.border, padding: SPACING.md, marginBottom: SPACING.sm, gap: 10 },
  rowYou:       { borderColor: '#C9A84C44', backgroundColor: '#C9A84C0A' },
  rowRank:      { fontSize: 12, fontWeight: '700', color: COLOR.muted, width: 28 },
  rowAvatar:    { width: 36, height: 36, borderRadius: RADIUS.lg, backgroundColor: '#7DC87A11', borderWidth: 1, borderColor: '#7DC87A33', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
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
  noResults:    { fontSize: 13, color: COLOR.dim, textAlign: 'center', paddingVertical: 20 },

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
