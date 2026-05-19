/*
 * SQL — seed national_rank for all existing profiles (run once in Supabase):
 *
 * UPDATE profiles p
 * SET national_rank = sub.rank
 * FROM (
 *   SELECT id, RANK() OVER (ORDER BY pop_score DESC NULLS LAST) as rank
 *   FROM profiles
 * ) sub
 * WHERE p.id = sub.id;
 */

import { useState, useRef, useCallback, useEffect } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import SkeletonLoader from '../components/SkeletonLoader';
import CourseAvatar from '../components/CourseAvatar';
import InitialsAvatar from '../components/InitialsAvatar';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';

function LeaderboardSkeleton() {
  return (
    <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'center', alignItems: 'flex-end', paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8, gap: 10 }}>
        {[{ mt: 24, h: 48 }, { mt: 0, h: 64 }, { mt: 36, h: 36 }].map((p, i) => (
          <View key={i} style={{ flex: 1, alignItems: 'center', marginTop: p.mt }}>
            <SkeletonLoader width={46} height={46} style={{ borderRadius: 23, marginBottom: 6 }} />
            <SkeletonLoader width="70%" height={11} style={{ marginBottom: 4 }} />
            <SkeletonLoader width="40%" height={18} style={{ marginBottom: 6 }} />
            <SkeletonLoader width="100%" height={p.h} style={{ borderRadius: 6 }} />
          </View>
        ))}
      </View>
      <View style={{ paddingHorizontal: 16, paddingTop: 8 }}>
        <SkeletonLoader width={80} height={10} style={{ marginBottom: 10 }} />
        {[...Array(6)].map((_, i) => (
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

const GOLFER_FILTERS = ['GLOBAL', 'FRIENDS', 'BY COURSE'];
const ALL_FILTERS    = ['GLOBAL', 'FRIENDS', 'BY COURSE', 'CADDIES'];

function popColor(score) {
  if (score >= 4.0) return '#7DC87A';
  if (score >= 3.0) return '#D4B86A';
  return '#C07A6A';
}

function TopThree({ entries, navigation }) {
  const [second, first, third] = [entries[1], entries[0], entries[2]];
  if (!first) return null;
  return (
    <View style={s.podium}>
      {/* 2nd */}
      {second && (
        <TouchableOpacity
          style={[s.podiumItem, { marginTop: 24 }]}
          onPress={second.userId && !second.isYou ? () => navigation?.navigate('PublicProfile', { userId: second.userId }) : undefined}
          activeOpacity={second.userId && !second.isYou ? 0.8 : 1}
        >
          <Ionicons name="trophy" size={20} color="#B8A882" style={{ marginBottom: 6 }} />
          <View style={[s.podiumAvatar, { borderColor: '#B8A882', overflow: 'hidden' }]}>
            <InitialsAvatar name={second.name} size={44} />
          </View>
          <Text style={s.podiumName} numberOfLines={1}>{second.name.split(' ')[0]}</Text>
          <Text style={[s.podiumPop, { color: popColor(second.pop) }]}>{second.pop?.toFixed(1) ?? '—'}</Text>
          <View style={[s.podiumBase, { height: 48, backgroundColor: '#B8A88222' }]}>
            <Text style={s.podiumRankText}>2</Text>
          </View>
        </TouchableOpacity>
      )}

      {/* 1st */}
      <TouchableOpacity
        style={s.podiumItem}
        onPress={first.userId && !first.isYou ? () => navigation?.navigate('PublicProfile', { userId: first.userId }) : undefined}
        activeOpacity={first.userId && !first.isYou ? 0.8 : 1}
      >
        <Ionicons name="trophy" size={20} color="#C9A84C" style={{ marginBottom: 6 }} />
        <View style={[s.podiumAvatar, { borderColor: '#C9A84C', width: 56, height: 56, borderRadius: 28, overflow: 'hidden' }]}>
          <InitialsAvatar name={first.name} size={54} />
        </View>
        <Text style={s.podiumName} numberOfLines={1}>{first.name.split(' ')[0]}</Text>
        <Text style={[s.podiumPop, { color: popColor(first.pop), fontSize: 28 }]}>{first.pop?.toFixed(1) ?? '—'}</Text>
        {entries.length > 1 && (
          <View style={[s.podiumBase, { height: 64, backgroundColor: '#C9A84C22' }]}>
            <Text style={[s.podiumRankText, { color: '#C9A84C' }]}>1</Text>
          </View>
        )}
      </TouchableOpacity>

      {/* 3rd */}
      {third && (
        <TouchableOpacity
          style={[s.podiumItem, { marginTop: 36 }]}
          onPress={third.userId && !third.isYou ? () => navigation?.navigate('PublicProfile', { userId: third.userId }) : undefined}
          activeOpacity={third.userId && !third.isYou ? 0.8 : 1}
        >
          <Ionicons name="trophy" size={20} color="#D4B86A" style={{ marginBottom: 6 }} />
          <View style={[s.podiumAvatar, { borderColor: '#D4B86A', overflow: 'hidden' }]}>
            <InitialsAvatar name={third.name} size={44} />
          </View>
          <Text style={s.podiumName} numberOfLines={1}>{third.name.split(' ')[0]}</Text>
          <Text style={[s.podiumPop, { color: popColor(third.pop) }]}>{third.pop?.toFixed(1) ?? '—'}</Text>
          <View style={[s.podiumBase, { height: 36, backgroundColor: '#D4B86A22' }]}>
            <Text style={[s.podiumRankText, { color: '#D4B86A' }]}>3</Text>
          </View>
        </TouchableOpacity>
      )}
    </View>
  );
}

function LeaderRow({ entry, navigation }) {
  const isYou = entry.isYou;
  const Wrapper = entry.userId && !isYou ? TouchableOpacity : View;
  return (
    <Wrapper
      style={[s.row, isYou && s.rowYou]}
      onPress={entry.userId && !isYou ? () => navigation?.navigate('PublicProfile', { userId: entry.userId }) : undefined}
      activeOpacity={0.8}
    >
      <Text style={s.rowRank}>#{entry.rank}</Text>
      <View style={[s.rowAvatar, isYou && { borderColor: '#C9A84C' }]}>
        <InitialsAvatar name={entry.name} size={34} />
      </View>
      <View style={s.rowInfo}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Text style={[s.rowName, isYou && { color: '#C9A84C' }]}>{entry.name}</Text>
          {entry.isCaddy && (
            <View style={s.caddyBadge}>
              <Text style={s.caddyBadgeText}>CADDY</Text>
            </View>
          )}
        </View>
        <Text style={s.rowHandle}>
          {entry.handle}
          {!entry.isCourse && entry.rounds != null ? ` · ${entry.rounds} rounds` : ''}
        </Text>
        {entry.course && (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 3 }}>
            <CourseAvatar courseName={entry.course} size={28} />
            <Text style={[s.rowHandle, { marginTop: 0 }]}>{entry.course}</Text>
          </View>
        )}
      </View>
      <View style={s.rowRight}>
        <Text style={[s.rowPop, { color: popColor(entry.pop) }]}>{entry.pop?.toFixed(1) ?? '—'}</Text>
      </View>
    </Wrapper>
  );
}

export default function LeaderboardScreen({ navigation }) {
  const { session, profile } = useAuth();
  const FILTERS = profile?.account_type === 'caddy' ? ALL_FILTERS : GOLFER_FILTERS;
  const [filter, setFilter]   = useState('GLOBAL');
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState(false);
  const [data, setData]       = useState([]);
  const [myRank, setMyRank]   = useState(null);

  const filterRef = useRef(filter);
  filterRef.current = filter;

  useEffect(() => {
    if (!session) navigation.replace('Welcome');
  }, [session]);

  const fetchData = useCallback(async (tab) => {
    setLoading(true);
    setError(false);
    try {
      const uid = session?.user?.id ?? null;

      let rows = [];
      let rankVal = null;

      if (tab === 'GLOBAL') {
        // Only show leaderboard if rounds exist
        const { count: roundsCount } = await supabase
          .from('rounds')
          .select('id', { count: 'exact', head: true });

        if (!roundsCount) { setData([]); setMyRank(null); setLoading(false); return; }

        const { data: profiles, error: err } = await supabase
          .from('profiles')
          .select('id, full_name, username, pop_score')
          .eq('account_type', 'golfer')
          .not('pop_score', 'is', null)
          .order('pop_score', { ascending: false })
          .limit(25);
        if (err) throw err;

        rows = (profiles || []).map((p, i) => ({
          rank:      i + 1,
          userId:    p.id,
          name:      p.full_name || p.username || 'Player',
          handle:    p.username ? `@${p.username}` : '',
          pop:       p.pop_score,
          badge:     i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : null,
          isYou:     p.id === uid,
        }));

        // Current user's rank
        if (uid) {
          const { data: me } = await supabase
            .from('profiles').select('pop_score').eq('id', uid).maybeSingle();
          if (me?.pop_score != null) {
            const { count } = await supabase
              .from('profiles')
              .select('id', { count: 'exact', head: true })
              .eq('account_type', 'golfer')
              .gt('pop_score', me.pop_score);
            rankVal = (count ?? 0) + 1;
          }
        }

      } else if (tab === 'FRIENDS') {
        if (!uid) { setData([]); setMyRank(null); setLoading(false); return; }

        const { data: follows, error: err } = await supabase
          .from('follows')
          .select('following_id, profiles!follows_following_id_fkey(id, full_name, username, pop_score)')
          .eq('follower_id', uid);
        if (err) throw err;

        const friends = (follows || []).map(f => f.profiles).filter(Boolean);
        if (friends.length === 0) { setData([]); setMyRank(null); setLoading(false); return; }

        // Include self
        const { data: me } = await supabase
          .from('profiles').select('id, full_name, username, pop_score, national_rank').eq('id', uid).maybeSingle();

        // Build combined list (self + friends) then sort by pop_score descending
        const allEntries = me ? [me, ...friends] : [...friends];
        allEntries.sort((a, b) => (parseFloat(b.pop_score) || 0) - (parseFloat(a.pop_score) || 0));

        rows = allEntries.map((p, i) => ({
          rank:      i + 1,
          userId:    p.id,
          name:      p.full_name || p.username || 'Player',
          handle:    p.username ? `@${p.username}` : '',
          pop:       p.pop_score,
          badge:     i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : null,
          isYou:     p.id === uid,
        }));

        const myEntry = rows.find(r => r.isYou);
        rankVal = myEntry?.rank ?? null;

      } else if (tab === 'BY COURSE') {
        const { data: courseData, error: err } = await supabase
          .from('courses')
          .select('name, city, state, pop_score, total_rounds, avg_time')
          .gt('total_rounds', 0)
          .order('pop_score', { ascending: false, nullsFirst: false })
          .limit(50);
        if (err) throw err;

        rows = (courseData || []).map((c, i) => {
          const hasEnoughRounds = (c.total_rounds ?? 0) >= 15;
          const locationParts   = [c.city, c.state].filter(Boolean).join(', ');
          const avgTimePart     = c.avg_time != null
            ? ` · ${Math.floor(c.avg_time / 60)}h ${String(c.avg_time % 60).padStart(2, '0')}m avg`
            : '';
          return {
            rank:   i + 1,
            name:   c.name,
            handle: locationParts + (c.total_rounds != null ? ` · ${c.total_rounds} rounds` : '') + avgTimePart,
            pop:      hasEnoughRounds ? c.pop_score : null,
            rounds:   c.total_rounds,
            badge:    i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : null,
            isYou:    false,
            isCourse: true,
          };
        });

      } else if (tab === 'CADDIES') {
        const { data: profiles, error: err } = await supabase
          .from('profiles')
          .select('id, full_name, username, caddy_rating, caddy_course')
          .eq('account_type', 'caddy')
          .not('caddy_rating', 'is', null)
          .order('caddy_rating', { ascending: false })
          .limit(25);
        if (err) throw err;

        rows = (profiles || []).map((p, i) => ({
          rank:      i + 1,
          userId:    p.id,
          name:      p.full_name || p.username || 'Caddy',
          handle:    p.username ? `@${p.username}` : '',
          pop:       p.caddy_rating,
          course:    p.caddy_course,
          badge:     i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : null,
          isYou:     p.id === uid,
          isCaddy:   true,
        }));
      }

      setData(rows);
      setMyRank(rankVal);
    } catch (e) {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [session?.user?.id]);

  // Re-fetch when filter changes
  useEffect(() => { fetchData(filter); }, [filter]);

  // Refresh on screen focus
  useFocusEffect(useCallback(() => { fetchData(filterRef.current); }, []));

  const topThree = data.slice(0, 3);
  const rest     = data.slice(3);

  const isEmpty = !loading && !error && data.length === 0;

  return (
    <SafeAreaView style={s.container}>
      <View style={s.header}>
        <Text style={s.wordmark}>LEADERBOARD</Text>
        {filter === 'CADDIES' && <Text style={s.courseTag}>CADDY RATING</Text>}
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

      {loading ? (
        <LeaderboardSkeleton />
      ) : error ? (
        <View style={s.emptyState}>
          <Ionicons name="cloud-offline-outline" size={48} color="rgba(201,168,76,0.3)" style={{ marginBottom: 14 }} />
          <Text style={s.emptyText}>Could not load leaderboard.</Text>
          <TouchableOpacity style={s.retryBtn} onPress={() => fetchData(filter)} activeOpacity={0.8}>
            <Text style={s.retryText}>RETRY</Text>
          </TouchableOpacity>
        </View>
      ) : isEmpty ? (
        <View style={s.emptyState}>
          <Ionicons name="trophy-outline" size={48} color="rgba(201,168,76,0.3)" style={{ marginBottom: 14 }} />
          <Text style={s.emptyText}>
            {filter === 'FRIENDS'
              ? 'Follow other players to see your friends\' rankings.'
              : filter === 'BY COURSE'
              ? 'No course data yet.'
              : filter === 'CADDIES'
              ? 'No caddy ratings yet.'
              : 'No rounds logged yet. Be the first on the leaderboard.'}
          </Text>
          {filter === 'FRIENDS' && (
            <TouchableOpacity style={s.retryBtn} onPress={() => navigation?.navigate('SearchUsers')} activeOpacity={0.8}>
              <Text style={s.retryText}>FIND PLAYERS</Text>
            </TouchableOpacity>
          )}
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
          <TopThree entries={topThree} navigation={navigation} />

          {/* Your ranking — shown immediately below podium */}
          {filter === 'GLOBAL' && myRank != null && (
            <View style={[s.yourRankCard, { marginBottom: 0 }]}>
              <Text style={s.yourRankLabel}>YOUR GLOBAL RANK</Text>
              <Text style={s.yourRankValue}>#{myRank.toLocaleString()}</Text>
            </View>
          )}
          {filter === 'FRIENDS' && myRank != null && (
            <View style={[s.yourRankCard, { marginBottom: 0 }]}>
              <Text style={s.yourRankLabel}>YOUR RANK AMONG FRIENDS</Text>
              <Text style={s.yourRankValue}>#{myRank}</Text>
            </View>
          )}

          <View style={s.listSection}>
            <Text style={s.sectionLabel}>RANKINGS</Text>
            {rest.map((entry, i) => <LeaderRow key={i} entry={entry} navigation={navigation} />)}
          </View>

          {filter === 'CADDIES' && (
            <View style={s.yourRankCard}>
              <Text style={s.yourRankLabel}>CADDY LEADERBOARD</Text>
              <Text style={[s.yourRankSub, { marginTop: 8 }]}>Ranked by Caddy Rating — average pace vs. course baseline</Text>
            </View>
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container:        { flex: 1, backgroundColor: '#090F0A' },
  header:           { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 22, paddingTop: 8, paddingBottom: 8 },
  wordmark:         { fontSize: 24, fontWeight: '300', color: '#F5EDD8', fontFamily: 'Georgia' },
  courseTag:        { fontSize: 9, fontWeight: '700', color: '#C9A84C', letterSpacing: 2, backgroundColor: '#C9A84C22', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5 },
  filterRow:        { flexDirection: 'row', paddingHorizontal: 16, gap: 8, marginBottom: 8 },
  filterBtn:        { flex: 1, paddingVertical: 10, alignItems: 'center', borderRadius: 10, backgroundColor: '#0D1A0F', borderWidth: 1, borderColor: '#7DC87A22' },
  filterBtnActive:  { borderColor: '#C9A84C', backgroundColor: '#C9A84C22' },
  filterText:       { fontSize: 8, fontWeight: '700', color: '#B8A882', letterSpacing: 1 },
  filterTextActive: { color: '#C9A84C' },
  podium:           { flexDirection: 'row', justifyContent: 'center', alignItems: 'flex-end', paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8, gap: 10 },
  podiumItem:       { flex: 1, alignItems: 'center' },
  podiumAvatar:     { width: 46, height: 46, borderRadius: 23, backgroundColor: '#0D1A0F', borderWidth: 2, alignItems: 'center', justifyContent: 'center', marginBottom: 6 },
  podiumInitial:    { fontSize: 18, fontWeight: '600' },
  podiumName:       { fontSize: 11, fontWeight: '600', color: '#F5EDD8', marginBottom: 2, textAlign: 'center' },
  podiumPop:        { fontSize: 22, fontWeight: '300', marginBottom: 6 },
  podiumBase:       { width: '100%', borderTopLeftRadius: 6, borderTopRightRadius: 6, alignItems: 'center', justifyContent: 'center' },
  podiumRankText:   { fontSize: 16, fontWeight: '700', color: '#B8A882' },
  listSection:      { paddingHorizontal: 16, paddingTop: 8 },
  sectionLabel:     { fontSize: 9, fontWeight: '700', color: '#C9A84C', letterSpacing: 2, marginBottom: 10 },
  row:              { flexDirection: 'row', alignItems: 'center', backgroundColor: '#0D1A0F', borderRadius: 14, borderWidth: 1, borderColor: '#7DC87A22', padding: 14, marginBottom: 8, gap: 10 },
  rowYou:           { borderColor: '#C9A84C44', backgroundColor: '#C9A84C0A' },
  rowRank:          { fontSize: 12, fontWeight: '700', color: '#B8A882', width: 28 },
  rowAvatar:        { width: 36, height: 36, borderRadius: 18, backgroundColor: '#7DC87A11', borderWidth: 1, borderColor: '#7DC87A33', alignItems: 'center', justifyContent: 'center' },
  rowInitial:       { fontSize: 14, fontWeight: '600', color: '#B8A882' },
  rowInfo:          { flex: 1 },
  rowName:          { fontSize: 14, fontWeight: '500', color: '#F5EDD8' },
  rowHandle:        { fontSize: 10, color: '#B8A88288', marginTop: 2 },
  rowRight:         { alignItems: 'flex-end' },
  rowPop:           { fontSize: 22, fontWeight: '300' },
  yourRankCard:     { marginVertical: 8, marginHorizontal: 16, backgroundColor: '#0D1A0F', borderRadius: 18, borderWidth: 1, borderColor: '#C9A84C44', paddingVertical: 10, paddingHorizontal: 14, alignItems: 'center' },
  yourRankLabel:    { fontSize: 9, fontWeight: '700', color: '#C9A84C', letterSpacing: 3, marginBottom: 8 },
  yourRankValue:    { fontSize: 42, fontWeight: '300', color: '#F5EDD8', marginBottom: 4 },
  yourRankSub:      { fontSize: 12, color: '#7DC87A', fontWeight: '600' },
  emptyState:       { alignItems: 'center', justifyContent: 'center', paddingVertical: 80, paddingHorizontal: 40 },
  emptyText:        { fontSize: 20, color: '#7A6E58', textAlign: 'center', fontFamily: 'serif', lineHeight: 28, marginBottom: 20 },
  retryBtn:         { backgroundColor: '#C9A84C', borderRadius: 12, paddingVertical: 12, paddingHorizontal: 28 },
  retryText:        { fontSize: 11, fontWeight: '700', color: '#090F0A', letterSpacing: 2 },
  caddyBadge:       { backgroundColor: '#C9A84C', borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2 },
  caddyBadgeText:   { fontSize: 7, fontWeight: '700', color: '#090F0A', letterSpacing: 1.5 },
});
