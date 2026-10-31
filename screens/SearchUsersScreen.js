/*
 * SQL — create follows table in Supabase:
 *
 * create table follows (
 *   id           uuid primary key default gen_random_uuid(),
 *   follower_id  uuid references profiles(id),
 *   following_id uuid references profiles(id),
 *   created_at   timestamp default now(),
 *   unique(follower_id, following_id)
 * );
 * alter table follows enable row level security;
 * create policy "select_follows" on follows for select using (true);
 * create policy "insert_follows" on follows for insert with check (true);
 * create policy "delete_follows" on follows for delete using (true);
 */

import { useState, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView,
  StyleSheet, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../lib/supabase';
import { sanitizeSearchText } from '../lib/profileColumns';
import { useAuth } from '../context/AuthContext';
import { sendLocalNotification, sendPushToUser } from '../lib/notifications';
import SkeletonLoader from '../components/SkeletonLoader';
import InitialsAvatar from '../components/InitialsAvatar';
import { computeFullRating, extractPlayerRoundStats } from '../lib/clockedRating';
import ScreenHeader from '../components/ScreenHeader';
import { COLOR, RADIUS } from '../lib/theme';

function SearchSkeletons() {
  return (
    <>
      {[...Array(4)].map((_, i) => (
        <View key={i} style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: COLOR.surface, borderRadius: RADIUS.md, borderWidth: 1, borderColor: '#7DC87A22', padding: 14, marginBottom: 10, gap: 12 }}>
          <SkeletonLoader width={42} height={42} style={{ borderRadius: 21 }} />
          <View style={{ flex: 1, gap: 8 }}>
            <SkeletonLoader width="55%" height={14} />
            <SkeletonLoader width="40%" height={11} />
          </View>
          <View style={{ alignItems: 'flex-end', gap: 6 }}>
            <SkeletonLoader width={36} height={28} />
            <SkeletonLoader width={72} height={28} style={{ borderRadius: RADIUS.sm }} />
          </View>
        </View>
      ))}
    </>
  );
}

// Aggregate 0–100 Clocked Score color — matches LeaderboardScreen's clockedColor().
function clockedColor(score) {
  if (score == null) return COLOR.dim;
  if (score >= 70) return COLOR.green;
  if (score >= 40) return COLOR.gold;
  return COLOR.muted;
}

export default function SearchUsersScreen({ navigation }) {
  const { user, profile: authProfile } = useAuth();
  const [query, setQuery]           = useState('');
  const [results, setResults]       = useState([]);
  const [following, setFollowing]   = useState(new Set());
  const [searching, setSearching]   = useState(false);
  const [searchError, setSearchError] = useState(false);

  const myUid      = user?.id ?? null;
  const myUsername = authProfile?.username ?? '';

  // Seed which users we already follow so buttons render correctly
  useEffect(() => {
    if (!myUid) return;
    (async () => {
      const { data } = await supabase.from('follows').select('following_id').eq('follower_id', myUid);
      if (data) setFollowing(new Set(data.map(r => r.following_id)));
    })();
  }, [myUid]);

  const search = async (text) => {
    setQuery(text);
    setSearchError(false);
    if (!text.trim()) { setResults([]); return; }
    setSearching(true);
    try {
      const { data, error: err } = await supabase
        .from('profiles')
        .select('id, full_name, username, handicap_index, home_course, avatar_url')
        .or(`username.ilike.%${sanitizeSearchText(text)}%,full_name.ilike.%${sanitizeSearchText(text)}%`)
        .neq('id', myUid ?? '')
        .limit(20);
      if (err) throw err;
      const found = data || [];
      setResults(found);

      // Batch-compute each result's real Clocked Score, matching the pattern
      // used by ProfileScreen's FriendsTab — one query for their rounds, one
      // for their confirmed participations, instead of the retired pop_score
      // column. Avoids N individual per-result queries.
      const resultIds = found.map(p => p.id);
      if (resultIds.length) {
        const { data: ownRounds } = await supabase
          .from('rounds').select('id, user_id, hole_scores')
          .eq('round_format', 'clocked').not('hole_scores', 'is', null)
          .in('user_id', resultIds);
        const byUser = {};
        (ownRounds ?? []).forEach(r => { (byUser[r.user_id] ??= []).push(r); });
        const roundIds = (ownRounds ?? []).map(r => r.id);
        let parts = [];
        if (roundIds.length) {
          const { data: partRows } = await supabase
            .from('round_participants').select('round_id, user_id, player_key')
            .eq('status', 'confirmed').in('round_id', roundIds).in('user_id', resultIds);
          parts = partRows ?? [];
        }
        const roundMap = {};
        (ownRounds ?? []).forEach(r => { roundMap[r.id] = r; });
        parts.forEach(p => {
          if (!byUser[p.user_id]) byUser[p.user_id] = [];
          const already = byUser[p.user_id].some(r => r.id === p.round_id);
          if (!already && roundMap[p.round_id]) byUser[p.user_id].push({ ...roundMap[p.round_id], _playerKey: p.player_key });
        });
        const withScores = found.map(p => {
          const playerName = p.full_name || p.username || 'Player';
          const roundStats = (byUser[p.id] ?? [])
            .map(r => extractPlayerRoundStats(r.hole_scores, r._playerKey ?? playerName))
            .filter(Boolean);
          const rating = computeFullRating({ roundStats, handicapIndex: p.handicap_index });
          return { ...p, clockedScore: rating.clockedScore };
        });
        setResults(withScores);
      }
    } catch (e) {
      setSearchError(true);
      setResults([]);
    } finally {
      setSearching(false);
    }
  };

  const toggleFollow = async (userId) => {
    const isFollowing = following.has(userId);
    // Optimistic UI — flip state immediately
    setFollowing(prev => {
      const next = new Set(prev);
      isFollowing ? next.delete(userId) : next.add(userId);
      return next;
    });
    if (isFollowing) {
      if (!myUid) return;
      await supabase.from('follows').delete()
        .eq('follower_id', myUid)
        .eq('following_id', userId);
    } else {
      if (!myUid) return;
      const { data: insertData, error: insertError } = await supabase.from('follows').insert({
        follower_id: myUid,
        following_id: userId,
      });
      // Notify the followed user
      const name = myUsername ? `@${myUsername}` : 'Someone';
      await sendPushToUser(userId, 'New Follower', `${name} started following you`, 'new_follower', { follower_id: myUid });
    }
  };

  return (
    <SafeAreaView style={s.container}>
      <ScreenHeader title="FIND PLAYERS" onBack={() => navigation.goBack()} borderless />

      <View style={s.searchWrap}>
        <TextInput
          style={s.searchInput}
          placeholder="Search by name or @username…"
          placeholderTextColor="#B8A88266"
          value={query}
          onChangeText={search}
          autoFocus
          autoCapitalize="none"
          autoCorrect={false}
        />
      </View>

      <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 40 }}>

        {/* Pre-search empty state */}
        {query.length === 0 && (
          <View style={s.emptyState}>
            <Ionicons name="people-outline" size={48} color="rgba(201,168,76,0.3)" style={{ marginBottom: 14 }} />
            <Text style={s.emptyText}>Search for players by name or username</Text>
          </View>
        )}

        {/* Skeleton while searching */}
        {searching && <SearchSkeletons />}

        {/* Error state */}
        {!searching && searchError && (
          <View style={s.emptyState}>
            <Ionicons name="cloud-offline-outline" size={48} color="rgba(201,168,76,0.3)" style={{ marginBottom: 14 }} />
            <Text style={s.emptyText}>Search failed. Please try again.</Text>
          </View>
        )}

        {/* No results */}
        {!searching && !searchError && query.length > 0 && results.length === 0 && (
          <View style={s.emptyState}>
            <Ionicons name="search-outline" size={48} color="rgba(201,168,76,0.3)" style={{ marginBottom: 14 }} />
            <Text style={s.emptyText}>No players found. Try a different name.</Text>
          </View>
        )}

        {/* Results */}
        {!searching && results.map(result => {
          const isFollowing = following.has(result.id);
          return (
            <TouchableOpacity
              key={result.id}
              style={s.row}
              onPress={() => navigation.navigate('PublicProfile', { userId: result.id })}
              activeOpacity={0.8}
            >
              <InitialsAvatar name={result.full_name} size={42} avatarUrl={result.avatar_url} />
              <View style={s.info}>
                <Text style={s.name} numberOfLines={1}>{result.full_name || '—'}</Text>
                <Text style={s.handle}>
                  @{result.username}{result.home_course ? ` · ${result.home_course}` : ''}
                </Text>
              </View>
              <View style={s.right}>
                <Text style={[s.pop, { color: clockedColor(result.clockedScore) }]}>
                  {result.clockedScore ?? '—'}
                </Text>
                <TouchableOpacity
                  style={[s.followBtn, isFollowing && s.followingBtn]}
                  onPress={(e) => { e.stopPropagation?.(); toggleFollow(result.id); }}
                  activeOpacity={0.7}
                >
                  <Text style={[s.followBtnText, isFollowing && s.followingBtnText]}>
                    {isFollowing ? 'FOLLOWING' : 'FOLLOW'}
                  </Text>
                </TouchableOpacity>
              </View>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container:       { flex: 1, backgroundColor: COLOR.bg },
  title:           { fontSize: 11, fontWeight: '700', color: COLOR.gold, letterSpacing: 4 },
  searchWrap:      { paddingHorizontal: 16, paddingBottom: 12 },
  searchInput:     { backgroundColor: COLOR.surface, borderWidth: 1, borderColor: '#7DC87A33', borderRadius: RADIUS.md, padding: 14, color: COLOR.cream, fontSize: 15 },
  row:             { flexDirection: 'row', alignItems: 'center', backgroundColor: COLOR.surface, borderRadius: RADIUS.md, borderWidth: 1, borderColor: '#7DC87A22', padding: 14, marginBottom: 10, gap: 12 },
  avatar:          { width: 42, height: 42, borderRadius: 21, backgroundColor: '#C9A84C22', borderWidth: 1, borderColor: '#C9A84C44', alignItems: 'center', justifyContent: 'center' },
  avatarText:      { fontSize: 17, fontWeight: '600', color: COLOR.gold },
  info:            { flex: 1 },
  name:            { fontSize: 15, fontWeight: '500', color: COLOR.cream },
  handle:          { fontSize: 11, color: COLOR.muted, marginTop: 2 },
  right:           { alignItems: 'flex-end', gap: 6 },
  pop:             { fontSize: 22, fontWeight: '300' },
  followBtn:       { backgroundColor: COLOR.gold, borderRadius: RADIUS.sm, paddingVertical: 6, paddingHorizontal: 12 },
  followingBtn:    { backgroundColor: 'transparent', borderWidth: 1, borderColor: '#C9A84C44' },
  followBtnText:   { fontSize: 9, fontWeight: '700', color: COLOR.bg, letterSpacing: 1.5 },
  followingBtnText:{ color: COLOR.gold },
  emptyState:      { alignItems: 'center', paddingVertical: 60, paddingHorizontal: 32 },
  emptyText:       { fontSize: 20, color: COLOR.dim, textAlign: 'center', lineHeight: 28 },
});
