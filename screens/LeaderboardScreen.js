import { useState, useRef, useCallback, useEffect } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import SkeletonLoader from '../components/SkeletonLoader';
import InitialsAvatar from '../components/InitialsAvatar';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { fetchClockedBoard, invalidateClockedBoard, DEFAULT_PROVISIONAL_ROUNDS } from '../lib/clockedRating';
import { fetchTestUserIds, MIN_RANKED_MINUTES_NINE } from '../lib/rankingFilters';
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
        <Text style={s.podiumName} numberOfLines={1}>{(entry.name ?? '').split(' ')[0]}</Text>
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
// Three fixed columns (rank, avatar, score) and one that flexes. The name and
// its PROVISIONAL badge share a line and the name gives way first, so a long
// name can never push the score out of its column.
function ClockedRow({ entry, navigation }) {
  const isYou = entry.isYou;
  const tappable = entry.userId && !isYou;
  const Wrapper = tappable ? TouchableOpacity : View;
  const rounds = entry.roundsUsed != null ? `${entry.roundsUsed} round${entry.roundsUsed === 1 ? '' : 's'}` : null;
  const sub = entry.isLegacy
    ? ['Before the clock', rounds]
    : [
        `Scoring ${entry.scoring != null ? Math.round(entry.scoring) : '—'}`,
        `Clock ${entry.clock != null ? Math.round(entry.clock) : '—'}`,
        rounds,
      ];
  return (
    <Wrapper
      style={[s.row, isYou && s.rowYou]}
      onPress={tappable ? () => navigation?.navigate('PublicProfile', { userId: entry.userId }) : undefined}
      activeOpacity={0.8}
    >
      <Text style={s.rowRank}>{entry.rank != null ? `#${entry.rank}` : '—'}</Text>
      <View style={[s.rowAvatar, isYou && { borderColor: COLOR.gold }]}>
        <InitialsAvatar name={entry.name} size={34} avatarUrl={entry.avatarUrl} />
      </View>
      <View style={s.rowInfo}>
        <View style={s.rowNameLine}>
          <Text style={[s.rowName, isYou && { color: COLOR.gold }]} numberOfLines={1}>{entry.name}</Text>
          {entry.isProvisional && (
            <View style={s.provBadge}><Text style={s.provBadgeText}>PROVISIONAL</Text></View>
          )}
        </View>
        <Text style={s.rowSubStat} numberOfLines={1}>{sub.filter(Boolean).join(' · ')}</Text>
      </View>
      <View style={s.rowRight}>
        <Text style={[s.rowScore, { color: entry.isLegacy ? COLOR.muted : clockedColor(entry.sortVal) }]}>
          {entry.sortVal != null ? Math.round(entry.sortVal) : '—'}
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

// ─── Board loaders ───────────────────────────────────────────────────────────
// Each returns a finished board for one viewer and touches no component
// state, so a slow response can only ever be stored under its own key.
async function loadClockedBoard(viewer) {
  const { ranked, legacy, testIds } = await fetchClockedBoard(supabase);
  const toRow = e => ({
    rank: e.rank ?? null, userId: e.userId, name: e.name, handle: e.handle,
    sortVal: e.rating.clockedScore, sortLabel: e.isLegacy ? 'LEGACY' : 'CLK',
    scoring: e.rating.scoring, clock: e.rating.clock,
    roundsUsed: e.rating.roundsUsed, isProvisional: !!e.rating.isProvisional, isLegacy: !!e.isLegacy,
    avatarUrl: e.avatarUrl, isYou: !!viewer && e.userId === viewer,
  });
  const mine = viewer ? ranked.find(e => e.userId === viewer) : null;
  const viewerIsTest = !!viewer && testIds.has(viewer);
  let myProjected = null;
  if (viewer && !viewerIsTest) {
    if (mine?.rating.isProvisional) myProjected = { roundsNeeded: mine.rating.roundsNeeded ?? 0, hasRounds: true };
    else if (!mine) myProjected = { roundsNeeded: DEFAULT_PROVISIONAL_ROUNDS, hasRounds: false };
  }
  return {
    rows: ranked.slice(0, 50).map(toRow),
    legacyRows: legacy.slice(0, 50).map(toRow),
    myRank: mine?.rank ?? null,
    myProjected,
    viewerIsTest,
  };
}

async function loadArcadeBoard(viewer, period, difficulty) {
  const [rows, testIds] = await Promise.all([
    fetchArcadeBoard({ period, difficulty, limit: 50 }),
    fetchTestUserIds(supabase),
  ]);
  return {
    rows: rows.map(r => ({ ...r, isYou: !!viewer && r.user_id === viewer })),
    legacyRows: [],
    myRank: (viewer && rows.find(r => r.user_id === viewer)?.rank) ?? null,
    myProjected: null,
    viewerIsTest: !!viewer && testIds.has(viewer),
  };
}

const boardKey = (who, filter, period, diff) =>
  filter === 'ARCADE' ? `${who}|ARCADE|${period}|${diff}` : `${who}|CLOCKED`;

// ─── Main Screen ─────────────────────────────────────────────────────────────
export default function LeaderboardScreen({ navigation, route }) {
  // Rendered inside the tab navigator (as "Ranks") or pushed on the root
  // stack (as "Leaderboard"). The tab instance's immediate navigator is the
  // tab navigator; the pushed instance's is the stack.
  const isTab = navigation.getState()?.type === 'tab';
  const { session } = useAuth();
  const uid = session?.user?.id ?? null;
  const who = uid ?? 'anon';

  const requested = route?.params?.board === 'ARCADE' ? 'ARCADE' : route?.params?.board === 'CLOCKED' ? 'CLOCKED' : null;
  const [filter, setFilter] = useState(requested ?? 'CLOCKED');

  // Arcade board slices.
  const requestedDiff = route?.params?.difficulty === 'beginner' ? 'beginner' : 'qualifying';
  const [arcadePeriod, setArcadePeriod] = useState('month');
  const [arcadeDiff, setArcadeDiff] = useState(requested === 'ARCADE' ? requestedDiff : 'qualifying');

  // The tab stays mounted, so a later navigate with params must switch it too.
  // A run just posted lands on this month's board for its own level.
  useEffect(() => {
    if (!requested) return;
    setFilter(requested);
    if (requested === 'ARCADE') { setArcadePeriod('month'); setArcadeDiff(requestedDiff); }
  }, [route?.params?.board, route?.params?.difficulty, route?.params?.ts]);

  // ── Boards, cached per slice ──
  // Every slice the player has opened stays in memory under its own key. A
  // tap shows the cached rows at once and refreshes them underneath; the
  // skeleton only appears for a slice that has never loaded, and the empty
  // state only once a request for that slice has come back with no rows.
  const key = boardKey(who, filter, arcadePeriod, arcadeDiff);
  const [boards, setBoards] = useState({});
  const [failed, setFailed] = useState({});
  const [refreshing, setRefreshing] = useState(false);
  const boardsRef = useRef(boards);
  boardsRef.current = boards;
  const keyRef = useRef(key);
  keyRef.current = key;
  const inflight = useRef({});

  const load = useCallback((k) => {
    if (inflight.current[k]) return inflight.current[k];
    const [viewerPart, kind, period, diff] = k.split('|');
    const viewer = viewerPart === 'anon' ? null : viewerPart;
    const p = (async () => {
      try {
        const result = kind === 'ARCADE'
          ? await loadArcadeBoard(viewer, period, diff)
          : await loadClockedBoard(viewer);
        setBoards(b => ({ ...b, [k]: result }));
        setFailed(f => (f[k] ? { ...f, [k]: false } : f));
      } catch {
        setFailed(f => ({ ...f, [k]: true }));
      } finally {
        delete inflight.current[k];
      }
    })();
    inflight.current[k] = p;
    return p;
  }, []);

  // Load the slice on screen whenever it changes, and refresh whichever slice
  // is on screen when the tab regains focus. The focus callback reads the key
  // from a ref: a closure over the first render would refetch the wrong board.
  useEffect(() => { load(key); }, [key, load]);
  useFocusEffect(useCallback(() => { load(keyRef.current); }, [load]));

  // Warm the other board and, on Arcade, the sibling levels.
  useEffect(() => {
    const t = setTimeout(() => {
      const want = [boardKey(who, 'CLOCKED'), boardKey(who, 'ARCADE', 'month', 'qualifying')];
      if (filter === 'ARCADE') ARCADE_DIFFS[arcadePeriod].forEach(([d]) => want.push(boardKey(who, 'ARCADE', arcadePeriod, d)));
      want.forEach(k => { if (!boardsRef.current[k]) load(k); });
    }, 300);
    return () => clearTimeout(t);
  }, [who, filter, arcadePeriod, load]);

  const retry = () => { setFailed(f => ({ ...f, [key]: false })); load(key); };
  const onRefresh = async () => {
    setRefreshing(true);
    if (filter !== 'ARCADE') invalidateClockedBoard();
    await load(key);
    setRefreshing(false);
  };
  const refreshControl = <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLOR.gold} />;

  useEffect(() => { if (!session) navigation.replace('Welcome'); }, [session]);

  const board = boards[key];
  const loading = !board && !failed[key];
  const error = !board && !!failed[key];
  const data = board?.rows ?? [];
  const legacyRows = board?.legacyRows ?? [];
  const myRank = board?.myRank ?? null;
  const myProjected = board?.myProjected ?? null;
  const viewerIsTest = !!board?.viewerIsTest;
  const isArcade = filter === 'ARCADE';
  const isEmpty = !!board && data.length === 0 && legacyRows.length === 0;

  const goPlay = () => {
    const root = navigation.getParent();
    if (root) root.navigate('ClockedSetup');
    else navigation.navigate('ClockedSetup');
  };

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
                onPress={() => { if (arcadePeriod !== k) { setArcadePeriod(k); setArcadeDiff(k === 'month' ? 'qualifying' : 'all'); } }} activeOpacity={0.8}
                accessibilityRole="tab" accessibilityState={{ selected: arcadePeriod === k }}>
                <Text style={[s.diffPillText, arcadePeriod === k && s.diffPillTextActive]}>{l}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <View style={s.diffRow}>
            {ARCADE_DIFFS[arcadePeriod].map(([k, l]) => (
              <TouchableOpacity key={k} style={[s.diffPill, arcadeDiff === k && s.diffPillActive]}
                onPress={() => setArcadeDiff(k)} activeOpacity={0.8}
                accessibilityRole="tab" accessibilityState={{ selected: arcadeDiff === k }}>
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
          <Ionicons name="cloud-offline-outline" size={48} color="rgba(232,204,110,0.3)" style={{ marginBottom: 14 }} />
          <Text style={s.emptyText}>Could not load rankings.</Text>
          <TouchableOpacity style={s.ctaBtn} onPress={retry} activeOpacity={0.8}>
            <Text style={s.ctaBtnText}>RETRY</Text>
          </TouchableOpacity>
        </View>
      ) : isEmpty && isArcade ? (
        <View style={s.emptyState}>
          <Ionicons name="game-controller-outline" size={56} color="rgba(232,204,110,0.2)" style={{ marginBottom: 18 }} />
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
          <Ionicons name="trophy-outline" size={56} color="rgba(232,204,110,0.2)" style={{ marginBottom: 18 }} />
          <Text style={s.emptyTitle}>Be the first.</Text>
          <Text style={s.emptyText}>No one is ranked here yet. Play nine on the clock and claim the top spot.</Text>
          <TouchableOpacity style={s.ctaBtn} onPress={goPlay} activeOpacity={0.85}>
            <Ionicons name="timer-outline" size={16} color={COLOR.bg} style={{ marginRight: 6 }} />
            <Text style={s.ctaBtnText}>PLAY</Text>
          </TouchableOpacity>
        </View>
      ) : isArcade ? (
        <ScrollView contentContainerStyle={{ paddingBottom: 40 }} refreshControl={refreshControl}>
          <Text style={s.courseListHeader}>
            {arcadePeriod === 'month' ? `${seasonLabel(currentSeason())} · best nine per player` : 'All time · best nine per player'}
            {arcadeDiff === 'qualifying' ? ` · intermediate and pro · ${daysLeftInSeason()} days left` : ''}
          </Text>
          {arcadePeriod === 'month' && arcadeDiff === 'qualifying' && (
            <Text style={s.glossaryWide}>Top {QUALIFY_TOP} at month end earn a spot in the first Clocked event's qualifier.</Text>
          )}
          {viewerIsTest && <Text style={s.glossaryWide}>This is a test account. Its runs are saved but not ranked.</Text>}
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
        <ScrollView contentContainerStyle={{ paddingBottom: 40 }} refreshControl={refreshControl}>
          {/* The podium is for scores with a clock behind them. */}
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
                  : `Play nine on the clock to get on the board. ${myProjected.roundsNeeded} rounds make it official.`}
              </Text>
            </View>
          )}
          {viewerIsTest && <Text style={s.glossaryWide}>This is a test account. Its rounds are saved but not ranked.</Text>}

          <View style={s.listSection}>
            <Text style={s.sectionLabel}>CLOCKED SCORE RANKINGS</Text>
            <Text style={s.glossary}>
              Real rounds on the clock. CLK is the Clocked Score, 0 to 100. A nine under {MIN_RANKED_MINUTES_NINE} minutes counts as practice.
            </Text>
            {data.map((entry, i) => (
              <ClockedRow key={entry.userId ?? i} entry={entry} navigation={navigation} />
            ))}
            {data.length === 0 && (
              <View style={s.openCard}>
                <Text style={s.openTitle}>No ranked rounds yet.</Text>
                <Text style={s.openText}>The first counted nine takes #1.</Text>
                <TouchableOpacity style={[s.ctaBtn, { marginTop: SPACING.md }]} onPress={goPlay} activeOpacity={0.85}>
                  <Ionicons name="timer-outline" size={16} color={COLOR.bg} style={{ marginRight: 6 }} />
                  <Text style={s.ctaBtnText}>PLAY</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>

          {legacyRows.length > 0 && (
            <View style={[s.listSection, { marginTop: SPACING.md }]}>
              <Text style={s.sectionLabelMuted}>LEGACY</Text>
              <Text style={s.glossary}>Rounds logged before the clock. Kept for the record and not ranked against Clocked Scores.</Text>
              {legacyRows.map((entry, i) => (
                <ClockedRow key={entry.userId ?? i} entry={entry} navigation={navigation} />
              ))}
            </View>
          )}
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
  cutLine:       { alignItems: 'center', paddingVertical: 6, backgroundColor: '#E8CC6E12', borderTopWidth: 1, borderBottomWidth: 1, borderColor: '#E8CC6E55' },
  cutText:       { fontSize: 8, fontWeight: '800', color: COLOR.gold, letterSpacing: 2 },

  // Filters
  filterRow:       { flexDirection: 'row', paddingHorizontal: SPACING.lg, gap: 6, marginBottom: SPACING.sm },
  filterBtn:       { flex: 1, paddingVertical: SPACING.sm, alignItems: 'center', borderRadius: RADIUS.sm, backgroundColor: COLOR.surface, borderWidth: 1, borderColor: COLOR.border },
  filterBtnActive: { borderColor: COLOR.gold, backgroundColor: '#E8CC6E22' },
  filterText:      { fontSize: 8, fontWeight: '700', color: COLOR.muted, letterSpacing: 1 },
  filterTextActive:{ color: COLOR.gold },

  // Format/division segment pills
  diffRow:          { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: SPACING.lg, gap: 6, marginBottom: SPACING.sm },
  diffPill:         { paddingVertical: 6, paddingHorizontal: SPACING.md, borderRadius: RADIUS.sm, backgroundColor: COLOR.surface, borderWidth: 1, borderColor: COLOR.border },
  diffPillActive:   { borderColor: COLOR.gold, backgroundColor: '#E8CC6E22' },
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
  rowYou:       { borderColor: '#E8CC6E44', backgroundColor: '#E8CC6E0A' },
  rowRank:      { fontSize: 12, fontWeight: '700', color: COLOR.muted, width: 30, fontVariant: ['tabular-nums'] },
  rowAvatar:    { width: 36, height: 36, borderRadius: RADIUS.lg, backgroundColor: '#7DC87A11', borderWidth: 1, borderColor: '#7DC87A33', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  rowInfo:      { flex: 1, minWidth: 0 },
  rowNameLine:  { flexDirection: 'row', alignItems: 'center', gap: 6 },
  rowName:      { flexShrink: 1, fontSize: 14, fontWeight: '500', color: COLOR.cream },
  provBadge:    { flexShrink: 0, paddingHorizontal: 5, paddingVertical: 2, borderRadius: 4, borderWidth: 1, borderColor: COLOR.borderGold, backgroundColor: '#E8CC6E12' },
  provBadgeText:{ fontSize: 7, fontWeight: '800', color: COLOR.gold, letterSpacing: 0.8 },
  rowRight:     { width: 46, alignItems: 'flex-end' },
  rowScore:     { fontSize: 22, fontWeight: '300', fontVariant: ['tabular-nums'] },
  rowScoreLabel:{ fontSize: 7, fontWeight: '700', color: COLOR.dim, letterSpacing: 1, marginTop: 1 },
  rowSubStat:   { fontSize: 10, fontWeight: '600', color: COLOR.muted, marginTop: 3 },

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
  yourRankCard:  { marginHorizontal: SPACING.lg, marginBottom: SPACING.sm, backgroundColor: COLOR.surface, borderRadius: RADIUS.lg, borderWidth: 1, borderColor: '#E8CC6E44', paddingVertical: SPACING.md, paddingHorizontal: SPACING.lg, alignItems: 'center' },
  yourRankLabel: { fontSize: 9, fontWeight: '700', color: COLOR.gold, letterSpacing: 3, marginBottom: 4 },
  yourRankValue: { fontSize: 36, fontWeight: '300', color: COLOR.cream, fontVariant: ['tabular-nums'] },

  // Provisional projection
  provCard:      { marginHorizontal: SPACING.lg, marginBottom: SPACING.sm, backgroundColor: '#E8CC6E0A', borderRadius: RADIUS.lg, borderWidth: 1, borderColor: COLOR.borderGold, paddingVertical: SPACING.md, paddingHorizontal: SPACING.lg, alignItems: 'center' },
  provCardLabel: { fontSize: 9, fontWeight: '700', color: COLOR.gold, letterSpacing: 3, marginBottom: 4 },
  provCardValue: { fontSize: 28, fontWeight: '300', color: COLOR.gold, fontVariant: ['tabular-nums'], marginBottom: 4 },
  provCardHint:  { fontSize: 11, color: COLOR.muted, textAlign: 'center', lineHeight: 16 },

  // List section
  listSection:   { paddingHorizontal: SPACING.lg, paddingTop: SPACING.sm },
  sectionLabel:  { fontSize: 9, fontWeight: '700', color: COLOR.gold, letterSpacing: 2, marginBottom: 10 },
  sectionLabelMuted: { fontSize: 9, fontWeight: '700', color: COLOR.muted, letterSpacing: 2, marginBottom: 10 },
  openCard:      { alignItems: 'center', backgroundColor: COLOR.surface, borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLOR.border, paddingVertical: SPACING.xl, paddingHorizontal: SPACING.lg, marginBottom: SPACING.sm },
  openTitle:     { fontSize: 16, fontWeight: '600', color: COLOR.cream, marginBottom: 4 },
  openText:      { fontSize: 13, color: COLOR.dim, textAlign: 'center' },

  // Empty state
  emptyState:    { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 60, paddingHorizontal: 40 },
  emptyTitle:    { fontSize: 22, fontWeight: '600', color: COLOR.cream, textAlign: 'center', marginBottom: 10 },
  emptyText:     { fontSize: 15, color: COLOR.dim, textAlign: 'center', lineHeight: 22, marginBottom: 20 },
  ctaBtn:        { flexDirection: 'row', alignItems: 'center', backgroundColor: COLOR.gold, borderRadius: RADIUS.lg, paddingVertical: SPACING.md, paddingHorizontal: SPACING.xl },
  ctaBtnText:    { fontSize: 12, fontWeight: '700', color: COLOR.bg, letterSpacing: 2 },
});
