// ─── TodayScreen — the home that works with 54 users ────────────────────────
// Replaces the feed. A feed's value is the number of people you follow times
// how often they post; golf is weekly at best and 44 of 54 accounts follow
// nobody, so that screen was empty by construction. This one is about you, so
// it always has something on it on day one.
//
// Order is deliberate: your number, then anything blocking you, then the
// things worth going and taking.

import { useState, useCallback } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { useActiveRoundInset } from '../lib/activeRound';
import ScreenHeader from '../components/ScreenHeader';
import CourseAvatar from '../components/CourseAvatar';
import RecentRoundsList from '../components/RecentRoundsList';
import { fetchClockedRatingForUser, computeNationalRank } from '../lib/clockedRating';
import { fetchPlayerRounds } from '../lib/headToHead';
import { fetchBoards, hydrateNames, splitForUser } from '../lib/courseRecords';
import { fetchSeasonBoard, currentSeason, daysLeftInSeason, QUALIFY_TOP } from '../lib/arcade/season';
import { fetchMyArcadeChallenges } from '../lib/arcade/challenges';
import { EVENT } from '../lib/event';
import { COLOR, RADIUS, TYPE, scoreTier } from '../lib/theme';

const signed = v => (v == null ? '—' : v > 0 ? `+${v}` : String(v));
const nameOf = p => p?.full_name?.split(' ')[0] ?? (p?.username ? `@${p.username}` : 'a player');

function Section({ label, action, onAction, children }) {
  return (
    <View style={{ marginTop: 22 }}>
      <View style={s.sectionRow}>
        <Text style={s.sectionLabel}>{label}</Text>
        {!!action && (
          <TouchableOpacity onPress={onAction} activeOpacity={0.7} accessibilityRole="button">
            <Text style={s.sectionAction}>{action}</Text>
          </TouchableOpacity>
        )}
      </View>
      {children}
    </View>
  );
}

function TodoRow({ icon, color, title, sub, cta, onPress }) {
  return (
    <TouchableOpacity style={s.todo} onPress={onPress} activeOpacity={0.85} accessibilityRole="button" accessibilityLabel={title}>
      <View style={[s.todoIcon, { backgroundColor: color + '22' }]}>
        <Ionicons name={icon} size={16} color={color} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={s.todoTitle} numberOfLines={1}>{title}</Text>
        {!!sub && <Text style={s.todoSub} numberOfLines={1}>{sub}</Text>}
      </View>
      <Text style={[s.todoCta, { color }]}>{cta}</Text>
    </TouchableOpacity>
  );
}

export default function TodayScreen({ navigation }) {
  const bannerInset = useActiveRoundInset();
  const { user, profile } = useAuth();
  const uid = user?.id;

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [rating, setRating] = useState({ clockedScore: null, isProvisional: true, roundsUsed: 0, roundsNeeded: 5, scoring: null, clock: null });
  const [rank, setRank] = useState(null);
  const [rounds, setRounds] = useState([]);
  const [todos, setTodos] = useState([]);
  const [records, setRecords] = useState({ held: [], chasing: [], names: {} });
  const [arcade, setArcade] = useState({ rank: null, points: null });

  const load = useCallback(async () => {
    if (!uid) { setLoading(false); return; }
    const name = profile?.full_name || profile?.username || 'Player';

    const [playerRounds, r] = await Promise.all([
      fetchPlayerRounds(uid, name),
      fetchClockedRatingForUser(supabase, uid, profile),
    ]);
    setRounds(playerRounds);
    setRating(r);
    setLoading(false);

    // ── Anything waiting on you ──
    const items = [];
    try {
      const { data: pending } = await supabase
        .from('round_participants')
        .select('round_id, status, rounds(course_name, created_at, holes)')
        .eq('user_id', uid).eq('status', 'pending').limit(5);
      (pending ?? []).forEach(p => items.push({
        key: `conf-${p.round_id}`, icon: 'checkmark-circle-outline', color: COLOR.green,
        title: 'Confirm your round', sub: p.rounds?.course_name || 'Quick Play',
        cta: 'CONFIRM', onPress: () => navigation.navigate('ConfirmRound', { roundId: p.round_id }),
      }));
    } catch { /* best effort */ }

    try {
      const { data: ch } = await supabase
        .from('challenges')
        .select('id, course_name, challenger_id, status')
        .eq('challenged_id', uid).eq('status', 'pending').limit(5);
      if (ch?.length) {
        const { data: profs } = await supabase.from('profiles').select('id, full_name, username').in('id', ch.map(c => c.challenger_id));
        const pm = {}; (profs ?? []).forEach(p => { pm[p.id] = p; });
        ch.forEach(c => items.push({
          key: `ch-${c.id}`, icon: 'flash-outline', color: COLOR.gold,
          title: `${nameOf(pm[c.challenger_id])} challenged you`, sub: c.course_name,
          cta: 'VIEW', onPress: () => navigation.navigate('PublicProfile', { userId: c.challenger_id }),
        }));
      }
    } catch { /* best effort */ }

    try {
      const duels = await fetchMyArcadeChallenges(uid);
      duels.filter(d => d.action === 'respond' || d.action === 'play').slice(0, 4).forEach(d => items.push({
        key: `duel-${d.id}`, icon: 'game-controller-outline', color: COLOR.goldBright,
        title: d.action === 'respond' ? `${nameOf(d.opponent)} wants an arcade duel` : 'Your arcade duel is waiting',
        sub: `Nine holes · ${d.difficulty}`,
        cta: d.action === 'respond' ? 'ANSWER' : 'PLAY',
        onPress: () => navigation.navigate('Arcade'),
      }));
    } catch { /* arcade tables land with the seasons migration */ }
    setTodos(items);

    // ── Where you stand this month in the arcade ──
    try {
      const board = await fetchSeasonBoard(currentSeason());
      const mine = board.findIndex(b => b.user_id === uid);
      if (mine >= 0) setArcade({ rank: mine + 1, points: board[mine].points });
      else setArcade({ rank: null, points: null });
    } catch { /* migration not applied yet */ }

    // ── Course records ──
    try {
      const boards = await fetchBoards({ limit: 400 });
      const split = splitForUser(boards, uid);
      const names = await hydrateNames([...split.held, ...split.chasing].slice(0, 8));
      setRecords({ ...split, names });
    } catch { /* best effort */ }

    computeNationalRank(supabase, uid).then(setRank).catch(() => {});
  }, [uid, profile, navigation]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const onRefresh = async () => { setRefreshing(true); await load(); setRefreshing(false); };

  const hasScore = rating.clockedScore != null && (rating.roundsUsed ?? 0) > 0;
  const tier = scoreTier(rating.clockedScore, rating.isProvisional || !hasScore);
  const firstName = profile?.full_name?.split(' ')[0] ?? profile?.username ?? '';

  return (
    <SafeAreaView style={s.container} edges={['top']}>
      <ScreenHeader
        title="CLOCKED" brand
        right={[
          { icon: 'book-outline', onPress: () => navigation.navigate('RulesScreen'), label: 'Rules of Clocked Golf' },
          { icon: 'notifications-outline', onPress: () => navigation.navigate('Notifications'), label: 'Notifications' },
          { icon: 'search-outline', onPress: () => navigation.navigate('SearchUsers'), label: 'Search' },
        ]}
      />

      {loading ? (
        <View style={s.center}><ActivityIndicator size="large" color={COLOR.gold} /></View>
      ) : (
        <ScrollView
          contentContainerStyle={{ paddingBottom: 48 + bannerInset }}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLOR.gold} />}
        >
          {/* ── Your number ── */}
          <TouchableOpacity style={s.hero} onPress={() => navigation.navigate('You')} activeOpacity={0.9} accessibilityRole="button" accessibilityLabel="Your Clocked Score">
            <View style={{ flex: 1 }}>
              <Text style={s.heroLabel}>{firstName ? `${firstName.toUpperCase()}'S CLOCKED SCORE` : 'YOUR CLOCKED SCORE'}</Text>
              <View style={s.heroNumRow}>
                <Text style={[s.heroNum, { color: tier.color }]}>{hasScore ? rating.clockedScore : '—'}</Text>
                {hasScore && <Text style={s.heroMax}>/100</Text>}
              </View>
              <Text style={[s.heroTier, { color: tier.color }]}>
                {hasScore ? tier.name : 'PLAY YOUR FIRST ROUND'}
                {hasScore && rank ? <Text style={s.heroRank}>{`   ·   #${rank} NATIONALLY`}</Text> : null}
              </Text>
            </View>
            {hasScore && (
              <View style={s.heroSplit}>
                <Text style={s.heroSplitVal}>{Math.round(rating.scoring ?? 0)}</Text>
                <Text style={s.heroSplitLabel}>SCORING</Text>
                <Text style={[s.heroSplitVal, { marginTop: 8 }]}>{Math.round(rating.clock ?? 0)}</Text>
                <Text style={s.heroSplitLabel}>CLOCK</Text>
              </View>
            )}
          </TouchableOpacity>

          {rating.isProvisional && (rating.roundsNeeded ?? 0) > 0 && (
            <Text style={s.provisional}>
              {rating.roundsUsed === 0
                ? 'Your score starts with your first clocked round.'
                : `${rating.roundsNeeded} more round${rating.roundsNeeded === 1 ? '' : 's'} and your score is established.`}
            </Text>
          )}

          {/* ── Waiting on you ── */}
          {todos.length > 0 && (
            <Section label="WAITING ON YOU">
              {todos.map(t => <TodoRow key={t.key} {...t} />)}
            </Section>
          )}

          {/* ── Arcade, this month ── */}
          <Section label="ARCADE · THIS MONTH" action="PLAY NINE" onAction={() => navigation.navigate('Arcade')}>
            <TouchableOpacity style={s.card} onPress={() => navigation.navigate('Arcade')} activeOpacity={0.85}>
              {arcade.rank ? (
                <>
                  <Text style={s.cardBig}>
                    #{arcade.rank}
                    <Text style={s.cardBigSub}>{arcade.rank <= QUALIFY_TOP ? '  QUALIFYING' : `  TOP ${QUALIFY_TOP} QUALIFIES`}</Text>
                  </Text>
                  <Text style={s.cardSub}>
                    {signed(arcade.points)} points this month {'·'} {daysLeftInSeason()} days left
                  </Text>
                </>
              ) : (
                <>
                  <Text style={s.cardTitle}>No qualifying run yet this month.</Text>
                  <Text style={s.cardSub}>
                    Top {QUALIFY_TOP} at month end earn a spot in the first Clocked event's qualifier. Intermediate and pro count. {daysLeftInSeason()} days left.
                  </Text>
                </>
              )}
            </TouchableOpacity>
          </Section>

          {/* ── Records you hold ── */}
          {records.held.length > 0 && (
            <Section label="RECORDS YOU HOLD">
              {records.held.slice(0, 4).map(b => (
                <TouchableOpacity key={b.course} style={s.recRow} activeOpacity={0.85}
                  onPress={() => navigation.navigate('CourseProfile', { course: { name: b.course } })}>
                  <CourseAvatar courseName={b.course} size={34} />
                  <View style={{ flex: 1 }}>
                    <Text style={s.recCourse} numberOfLines={1}>{b.course}</Text>
                    <Text style={s.recMeta} numberOfLines={1}>
                      {b.bestPoints?.userId === uid ? `Points record ${signed(b.bestPoints.points)}` : ''}
                      {b.bestPoints?.userId === uid && b.bestTime?.userId === uid ? ' · ' : ''}
                      {b.bestTime?.userId === uid ? 'Fastest round' : ''}
                    </Text>
                  </View>
                  <Ionicons name="trophy" size={16} color={COLOR.gold} />
                </TouchableOpacity>
              ))}
            </Section>
          )}

          {/* ── Records to go take ── */}
          {records.chasing.length > 0 && (
            <Section label="GO TAKE ONE">
              {records.chasing.slice(0, 4).map(b => {
                const holder = records.names[b.bestPoints?.userId];
                return (
                  <TouchableOpacity key={b.course} style={s.recRow} activeOpacity={0.85}
                    onPress={() => navigation.navigate('CourseProfile', { course: { name: b.course } })}>
                    <CourseAvatar courseName={b.course} size={34} />
                    <View style={{ flex: 1 }}>
                      <Text style={s.recCourse} numberOfLines={1}>{b.course}</Text>
                      <Text style={s.recMeta} numberOfLines={1}>
                        {holder ? `${nameOf(holder)} holds it at ${signed(b.bestPoints.points)}` : `Record ${signed(b.bestPoints?.points)}`}
                      </Text>
                    </View>
                    <Text style={s.recChase}>CHASE</Text>
                  </TouchableOpacity>
                );
              })}
            </Section>
          )}

          {/* ── The event ── */}
          <Section label="THE FIRST CLOCKED EVENT">
            <TouchableOpacity style={s.card} onPress={() => navigation.navigate('Tournament')} activeOpacity={0.85}>
              <Text style={s.cardTitle}>{EVENT.dateLabel} · {EVENT.timeLabel} · {EVENT.venue}</Text>
              <Text style={s.cardSub}>Two-player teams, {EVENT.entryLabel}, cash prize. {EVENT.teamCap}, hand-picked, with a waitlist.</Text>
              <Text style={s.cardLink}>APPLY WITH YOUR PARTNER  {'›'}</Text>
            </TouchableOpacity>
          </Section>

          {/* ── Your rounds ── */}
          {rounds.length > 0 ? (
            <View style={{ marginTop: 22 }}>
              <RecentRoundsList rounds={rounds} navigation={navigation} limit={5} title="YOUR RECENT ROUNDS" />
            </View>
          ) : (
            <Section label="GET STARTED">
              <View style={s.card}>
                <Text style={s.cardTitle}>Play your first round on the clock.</Text>
                <Text style={s.cardSub}>
                  Every hole gets a time par. Points for every score, a penalty for running over, and one number from 0 to 100 that follows you.
                </Text>
              </View>
            </Section>
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container:     { flex: 1, backgroundColor: COLOR.bg },
  center:        { flex: 1, alignItems: 'center', justifyContent: 'center' },

  hero:          { flexDirection: 'row', alignItems: 'center', marginHorizontal: 16, marginTop: 6, backgroundColor: COLOR.surface, borderRadius: RADIUS.lg, borderWidth: 1, borderColor: COLOR.borderGold, paddingVertical: 18, paddingHorizontal: 18, gap: 16 },
  heroLabel:     { fontSize: 9, fontWeight: '700', color: COLOR.gold, letterSpacing: 2.5 },
  heroNumRow:    { flexDirection: 'row', alignItems: 'baseline', marginTop: 4 },
  heroNum:       { fontSize: 56, fontWeight: '200', fontVariant: ['tabular-nums'], lineHeight: 62 },
  heroNumEmpty:  { fontSize: 30, lineHeight: 34 },
  heroMax:       { fontSize: 15, color: COLOR.dim, marginLeft: 4 },
  heroTier:      { fontSize: 10, fontWeight: '800', letterSpacing: 1.8, marginTop: 2 },
  heroRank:      { color: COLOR.muted, fontWeight: '700' },
  heroSplit:     { alignItems: 'flex-end', borderLeftWidth: 1, borderLeftColor: COLOR.border, paddingLeft: 16 },
  heroSplitVal:  { fontSize: 18, fontWeight: '600', color: COLOR.cream, fontVariant: ['tabular-nums'] },
  heroSplitLabel:{ fontSize: 8, fontWeight: '700', color: COLOR.dim, letterSpacing: 1.5 },
  provisional:   { fontSize: 11, color: COLOR.dim, fontStyle: 'italic', marginTop: 8, marginHorizontal: 20 },

  sectionRow:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, marginBottom: 8 },
  sectionLabel:  { fontSize: 9, fontWeight: '700', color: COLOR.gold, letterSpacing: 3 },
  sectionAction: { fontSize: 9, fontWeight: '800', color: COLOR.muted, letterSpacing: 1.5 },

  todo:          { flexDirection: 'row', alignItems: 'center', gap: 12, marginHorizontal: 16, marginBottom: 8, backgroundColor: COLOR.surface, borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLOR.border, padding: 12 },
  todoIcon:      { width: 32, height: 32, borderRadius: RADIUS.sm, alignItems: 'center', justifyContent: 'center' },
  todoTitle:     { fontSize: 13, fontWeight: '600', color: COLOR.cream },
  todoSub:       { fontSize: 11, color: COLOR.dim, marginTop: 2 },
  todoCta:       { fontSize: 10, fontWeight: '800', letterSpacing: 1.5 },

  card:          { marginHorizontal: 16, backgroundColor: COLOR.surface, borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLOR.border, padding: 14 },
  cardBig:       { ...TYPE.display, fontSize: 24, color: COLOR.gold },
  cardBigSub:    { ...TYPE.display, fontSize: 10, color: COLOR.muted, letterSpacing: 1.5 },
  cardTitle:     { fontSize: 14, fontWeight: '600', color: COLOR.cream },
  cardSub:       { fontSize: 11, color: COLOR.dim, lineHeight: 17, marginTop: 4 },
  cardLink:      { fontSize: 10, fontWeight: '800', color: COLOR.gold, letterSpacing: 1.5, marginTop: 10 },

  recRow:        { flexDirection: 'row', alignItems: 'center', gap: 4, marginHorizontal: 16, marginBottom: 6, backgroundColor: COLOR.surface, borderRadius: RADIUS.sm, borderWidth: 1, borderColor: COLOR.border, padding: 10 },
  recCourse:     { fontSize: 13, fontWeight: '600', color: COLOR.cream },
  recMeta:       { fontSize: 10, color: COLOR.dim, marginTop: 2 },
  recChase:      { fontSize: 9, fontWeight: '800', color: COLOR.muted, letterSpacing: 1.5, marginRight: 4 },
});
