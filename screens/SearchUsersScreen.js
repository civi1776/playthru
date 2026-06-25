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
import { useAuth } from '../context/AuthContext';
import { sendLocalNotification, sendPushToUser } from '../lib/notifications';
import SkeletonLoader from '../components/SkeletonLoader';
import InitialsAvatar from '../components/InitialsAvatar';

function SearchSkeletons() {
  return (
    <>
      {[...Array(4)].map((_, i) => (
        <View key={i} style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: '#0D1A0F', borderRadius: 14, borderWidth: 1, borderColor: '#7DC87A22', padding: 14, marginBottom: 10, gap: 12 }}>
          <SkeletonLoader width={42} height={42} style={{ borderRadius: 21 }} />
          <View style={{ flex: 1, gap: 8 }}>
            <SkeletonLoader width="55%" height={14} />
            <SkeletonLoader width="40%" height={11} />
          </View>
          <View style={{ alignItems: 'flex-end', gap: 6 }}>
            <SkeletonLoader width={36} height={28} />
            <SkeletonLoader width={72} height={28} style={{ borderRadius: 8 }} />
          </View>
        </View>
      ))}
    </>
  );
}

function popColor(score) {
  if (score >= 4.0) return '#7DC87A';
  if (score >= 3.0) return '#D4B86A';
  return '#C07A6A';
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
        .select('id, full_name, username, pop_score, home_course, account_type, avatar_url')
        .or(`username.ilike.%${text}%,full_name.ilike.%${text}%`)
        .neq('id', myUid ?? '')
        .limit(20);
      if (err) throw err;
      setResults(data || []);
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
      <View style={s.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={s.backBtn}>
          <Text style={s.backText}>←</Text>
        </TouchableOpacity>
        <Text style={s.title}>FIND PLAYERS</Text>
        <View style={{ width: 40 }} />
      </View>

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
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Text style={s.name} numberOfLines={1}>{result.full_name || '—'}</Text>
                  {result.account_type === 'caddy' && (
                    <View style={s.caddyBadge}>
                      <Text style={s.caddyBadgeText}>CADDY</Text>
                    </View>
                  )}
                </View>
                <Text style={s.handle}>
                  @{result.username}{result.home_course ? ` · ${result.home_course}` : ''}
                </Text>
              </View>
              <View style={s.right}>
                <Text style={[s.pop, { color: popColor(result.pop_score) }]}>
                  {result.pop_score != null ? result.pop_score.toFixed(1) : '—'}
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
  container:       { flex: 1, backgroundColor: '#090F0A' },
  header:          { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8 },
  backBtn:         { width: 40, height: 40, justifyContent: 'center' },
  backText:        { fontSize: 22, color: '#C9A84C' },
  title:           { fontSize: 11, fontWeight: '700', color: '#C9A84C', letterSpacing: 4 },
  searchWrap:      { paddingHorizontal: 16, paddingBottom: 12 },
  searchInput:     { backgroundColor: '#0D1A0F', borderWidth: 1, borderColor: '#7DC87A33', borderRadius: 14, padding: 14, color: '#F5EDD8', fontSize: 15 },
  row:             { flexDirection: 'row', alignItems: 'center', backgroundColor: '#0D1A0F', borderRadius: 14, borderWidth: 1, borderColor: '#7DC87A22', padding: 14, marginBottom: 10, gap: 12 },
  avatar:          { width: 42, height: 42, borderRadius: 21, backgroundColor: '#C9A84C22', borderWidth: 1, borderColor: '#C9A84C44', alignItems: 'center', justifyContent: 'center' },
  avatarText:      { fontSize: 17, fontWeight: '600', color: '#C9A84C' },
  info:            { flex: 1 },
  name:            { fontSize: 15, fontWeight: '500', color: '#F5EDD8' },
  handle:          { fontSize: 11, color: '#B8A882', marginTop: 2 },
  right:           { alignItems: 'flex-end', gap: 6 },
  pop:             { fontSize: 22, fontWeight: '300' },
  followBtn:       { backgroundColor: '#C9A84C', borderRadius: 8, paddingVertical: 6, paddingHorizontal: 12 },
  followingBtn:    { backgroundColor: 'transparent', borderWidth: 1, borderColor: '#C9A84C44' },
  followBtnText:   { fontSize: 9, fontWeight: '700', color: '#090F0A', letterSpacing: 1.5 },
  followingBtnText:{ color: '#C9A84C' },
  emptyState:      { alignItems: 'center', paddingVertical: 60, paddingHorizontal: 32 },
  emptyText:       { fontSize: 20, color: '#7A6E58', textAlign: 'center', fontFamily: 'serif', lineHeight: 28 },
  caddyBadge:      { backgroundColor: '#C9A84C', borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2 },
  caddyBadgeText:  { fontSize: 7, fontWeight: '700', color: '#090F0A', letterSpacing: 1.5 },
});
