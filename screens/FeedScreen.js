// ─── Feed — the front door ───────────────────────────────────────────────────
// Compact header, feed-forward. No hero CTA — Play lives in the tab bar.

import { useState, useRef, useCallback, useEffect } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, TextInput, StyleSheet,
  ActivityIndicator, RefreshControl, Modal, KeyboardAvoidingView, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import InitialsAvatar from '../components/InitialsAvatar';
import CourseAvatar from '../components/CourseAvatar';
import { sendPushToUser } from '../lib/notifications';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ROUND_STATE_KEY, ROUND_STALENESS_MS } from '../lib/roundConstants';

const PAGE_SIZE = 20;

// ─── Helpers ─────────────────────────────────────────────────────────────────
function timeAgo(isoStr) {
  if (!isoStr) return '';
  const diff = Math.floor((Date.now() - new Date(isoStr).getTime()) / 1000);
  if (diff < 60)     return 'Just now';
  if (diff < 3600)   return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400)  return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 172800) return 'Yesterday';
  if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
  const d = new Date(isoStr);
  const mo = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${mo[d.getMonth()]} ${d.getDate()}`;
}

function popColor(score) {
  if (score >= 4.0) return '#7DC87A';
  if (score >= 3.0) return '#D4B86A';
  return '#C07A6A';
}

function formatTime(minutes) {
  if (!minutes) return null;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

function formatClockDelta(totalElapsed, totalTimePar) {
  if (totalElapsed == null || totalTimePar == null) return null;
  const delta = totalTimePar - totalElapsed;
  const abs = Math.abs(delta);
  const m = Math.floor(abs / 60);
  const s = abs % 60;
  const timeStr = `${m}:${String(s).padStart(2, '0')}`;
  return delta >= 0 ? `beat the clock by ${timeStr}` : `over by ${timeStr}`;
}

function paceScoreColor(pop) {
  if (pop >= 4.5) return '#7DC87A';
  if (pop >= 4.0) return '#C9A84C';
  if (pop >= 3.5) return '#F0CB5B';
  return '#E85D4A';
}

// ─── Round Content Card ──────────────────────────────────────────────────────
function RoundContentCard({ content, navigation }) {
  const isOnTheClock = content?.round_format === 'clocked';
  const pop = content?.pop_score;
  const teamScore = content?.team_score;

  const parts = [
    content?.holes     ? `${content.holes}h`   : null,
    content?.transport ?? null,
    content?.players   ? `${content.players}p` : null,
    content?.duration_minutes ? formatTime(content.duration_minutes) : null,
  ].filter(Boolean);

  const clockResult = isOnTheClock
    ? formatClockDelta(content?.total_elapsed, content?.total_time_par)
    : null;

  return (
    <TouchableOpacity
      style={[s.roundCard, isOnTheClock && s.roundCardClocked]}
      onPress={() => content?.course_name && navigation?.navigate('CourseProfile', { course: { name: content.course_name } })}
      activeOpacity={0.85}
    >
      {/* Clock badge for on-the-clock rounds */}
      {isOnTheClock && (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 6 }}>
          <Ionicons name="timer-outline" size={11} color="#C9A84C" />
          <Text style={{ fontSize: 10, color: '#C9A84C', fontWeight: '700', letterSpacing: 1.5 }}>ON THE CLOCK</Text>
        </View>
      )}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        {content?.course_name ? <CourseAvatar courseName={content.course_name} city={content.city ?? null} size={44} /> : null}
        <View style={{ flex: 1 }}>
          <Text style={s.roundCourse} numberOfLines={1}>{content?.course_name || 'Quick Play'}</Text>
          {parts.length > 0 && <Text style={s.roundDetails}>{parts.join(' \u00B7 ')}</Text>}
          {clockResult && <Text style={s.clockResult}>{clockResult}</Text>}
        </View>
        {/* Score badge */}
        {isOnTheClock && teamScore != null ? (
          <View style={[s.scoreBadge, { borderColor: '#C9A84C44', minHeight: 52 }]}>
            <Text style={[s.scoreBadgeNum, { color: '#C9A84C', fontSize: 22 }]}>
              {teamScore > 0 ? `+${teamScore}` : teamScore}
            </Text>
            <Text style={[s.scoreBadgeLabel, { color: '#C9A84C' }]}>PTS</Text>
          </View>
        ) : pop != null ? (
          <View style={[s.scoreBadge, { minHeight: 52 }]}>
            <Text style={[s.scoreBadgeNum, { color: paceScoreColor(pop), fontSize: 22 }]}>{pop.toFixed(1)}</Text>
            <Text style={s.scoreBadgeLabel}>pace</Text>
          </View>
        ) : null}
      </View>
    </TouchableOpacity>
  );
}

// ─── Feed Item ───────────────────────────────────────────────────────────────
function FeedItem({ item, userId, navigation, likedIds, commentCounts, onLike, onComment }) {
  const handle = item.username ? `@${item.username}` : (item.full_name?.split(' ')[0] ?? 'Golfer');
  const liked  = likedIds.has(item.id);
  const cCount = commentCounts[item.id] ?? 0;

  const isOnTheClock = item.content?.round_format === 'clocked';

  const actionLabel = (() => {
    switch (item.type) {
      case 'round_logged':       return isOnTheClock ? 'played on the clock' : 'logged a pace round';
      case 'live_round_started': return null;
      case 'milestone':          return null;
      case 'course_review':      return `reviewed ${item.content?.course_name ?? 'a course'}`;
      case 'user_post':          return null;
      default:                   return null;
    }
  })();

  const isLive = item.type === 'live_round_started';

  return (
    <View style={[s.feedCard, isLive && s.feedCardLive]}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10 }}>
        <TouchableOpacity onPress={() => navigation.navigate('PublicProfile', { userId: item.user_id })} activeOpacity={0.8}>
          <View>
            <InitialsAvatar name={item.full_name} size={36} avatarUrl={item.avatar_url} />
            {isLive && <View style={s.avatarLiveDot} />}
          </View>
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 2 }}>
            <TouchableOpacity onPress={() => navigation.navigate('PublicProfile', { userId: item.user_id })} activeOpacity={0.8}>
              <Text style={s.handle}>{handle}</Text>
            </TouchableOpacity>
            <Text style={s.timestamp}>{timeAgo(item.created_at)}</Text>
          </View>

          {actionLabel && <Text style={s.actionLabel}>{actionLabel}</Text>}

          {item.type === 'round_logged' && item.content && (
            <RoundContentCard content={item.content} navigation={navigation} />
          )}

          {item.type === 'user_post' && item.content?.text && (
            <Text style={s.postText}>{item.content.text}</Text>
          )}

          {isLive && (
            <View style={s.liveBanner}>
              <View style={s.liveDot} />
              <Text style={s.liveLabel}>Playing at {item.content?.course_name ?? 'a course'}</Text>
            </View>
          )}

          {item.type === 'milestone' && item.content?.title && (
            <View style={s.milestoneCard}>
              <View style={s.milestoneIcon}>
                <Ionicons name="star" size={20} color="#C9A84C" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.milestoneTitle}>{item.content.title}</Text>
                {item.content.body && <Text style={s.milestoneBody}>{item.content.body}</Text>}
              </View>
            </View>
          )}

          {/* Actions */}
          <View style={s.actionBar}>
            <TouchableOpacity style={s.actionBtn} onPress={() => onLike(item, liked)} activeOpacity={0.7}>
              <Ionicons name={liked ? 'thumbs-up' : 'thumbs-up-outline'} size={14} color={liked ? '#7DC87A' : '#7A6E58'} />
              {item.likes > 0 && <Text style={[s.actionCount, liked && { color: '#7DC87A' }]}>{item.likes}</Text>}
            </TouchableOpacity>
            <TouchableOpacity style={s.actionBtn} onPress={() => onComment(item)} activeOpacity={0.7}>
              <Ionicons name="chatbubble-outline" size={13} color="#7A6E58" />
              {cCount > 0 && <Text style={s.actionCount}>{cCount}</Text>}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </View>
  );
}

// ─── Comment Sheet ───────────────────────────────────────────────────────────
function CommentSheet({ visible, activity, userId, onClose, onPosted }) {
  const [comments, setComments] = useState([]);
  const [loading, setLoading]   = useState(false);
  const [draft, setDraft]       = useState('');
  const [posting, setPosting]   = useState(false);

  useEffect(() => {
    if (!visible || !activity?.id) return;
    setComments([]);
    setDraft('');
    loadComments();
  }, [visible, activity?.id]);

  const loadComments = async () => {
    setLoading(true);
    try {
      const { data } = await supabase
        .from('activity_comments')
        .select('id, body, user_id, created_at')
        .eq('activity_id', activity.id)
        .order('created_at', { ascending: true });
      if (!data?.length) { setComments([]); return; }
      const uids = [...new Set(data.map(c => c.user_id))];
      const { data: profs } = await supabase.from('profiles').select('id, username, full_name, avatar_url').in('id', uids);
      const pm = {};
      (profs ?? []).forEach(p => { pm[p.id] = p; });
      setComments(data.map(c => ({ ...c, username: pm[c.user_id]?.username, full_name: pm[c.user_id]?.full_name, avatar_url: pm[c.user_id]?.avatar_url })));
    } catch {} finally { setLoading(false); }
  };

  const postComment = async () => {
    const body = draft.trim();
    if (!body || !userId || !activity?.id) return;
    setPosting(true);
    try {
      await supabase.from('activity_comments').insert({ activity_id: activity.id, user_id: userId, body });
      setDraft('');
      onPosted?.(activity.id);
      await loadComments();

      // Notify activity owner (if not self)
      if (activity.user_id && activity.user_id !== userId) {
        const { data: me } = await supabase.from('profiles').select('username, full_name').eq('id', userId).maybeSingle();
        const name = me?.username ? `@${me.username}` : (me?.full_name?.split(' ')[0] ?? 'Someone');
        const snippet = body.length > 60 ? body.slice(0, 60) + '\u2026' : body;

        // Push notification
        sendPushToUser(activity.user_id, `${name} commented`, `"${snippet}"`, 'comment', { activity_id: activity.id }).catch(() => {});

        // In-app notification row
        supabase.from('notifications').insert({
          user_id: activity.user_id,
          type: 'comment',
          title: `${name} commented`,
          body: `"${snippet}"`,
          meta: { activity_id: activity.id, round_id: activity.round_id ?? null },
        }).catch(() => {});
      }
    } catch {} finally { setPosting(false); }
  };

  if (!visible) return null;

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView style={{ flex: 1, backgroundColor: '#090F0A' }}>
        {/* Header */}
        <View style={cs.header}>
          <Text style={cs.title}>Comments</Text>
          <TouchableOpacity onPress={onClose} activeOpacity={0.7}>
            <Ionicons name="close" size={22} color="#B8A882" />
          </TouchableOpacity>
        </View>

        {/* Round context card */}
        {activity?.content?.course_name && (
          <View style={cs.contextCard}>
            <Text style={cs.contextCourse} numberOfLines={1}>{activity.content.course_name}</Text>
            <Text style={cs.contextMeta}>
              {[activity.content.holes && `${activity.content.holes}h`, activity.content.transport].filter(Boolean).join(' \u00B7 ')}
            </Text>
          </View>
        )}

        {/* Comment list */}
        <FlatList
          data={comments}
          keyExtractor={(c, i) => c.id ? `${c.id}-${i}` : `comment-${i}`}
          contentContainerStyle={{ padding: 16, gap: 12, flexGrow: 1 }}
          ListEmptyComponent={
            loading
              ? <ActivityIndicator color="#C9A84C" style={{ marginTop: 40 }} />
              : <Text style={cs.emptyText}>No comments yet. Be first.</Text>
          }
          renderItem={({ item }) => {
            const name = item.username ? `@${item.username}` : (item.full_name?.split(' ')[0] ?? 'Golfer');
            return (
              <View style={{ flexDirection: 'row', gap: 10 }}>
                <InitialsAvatar name={item.full_name} size={30} avatarUrl={item.avatar_url} />
                <View style={cs.bubble}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 3 }}>
                    <Text style={cs.commenterName}>{name}</Text>
                    <Text style={cs.commentTime}>{timeAgo(item.created_at)}</Text>
                  </View>
                  <Text style={cs.commentBody}>{item.body}</Text>
                </View>
              </View>
            );
          }}
        />

        {/* Compose input */}
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <View style={cs.composeRow}>
            <TextInput
              style={cs.input}
              placeholder="Add a comment\u2026"
              placeholderTextColor="#7A6E58"
              value={draft}
              onChangeText={setDraft}
              maxLength={280}
              multiline
            />
            <TouchableOpacity
              onPress={postComment}
              disabled={!draft.trim() || posting}
              activeOpacity={0.8}
              style={[cs.sendBtn, draft.trim() && cs.sendBtnActive]}
            >
              {posting
                ? <ActivityIndicator size="small" color="#090F0A" />
                : <Ionicons name="arrow-up" size={16} color={draft.trim() ? '#090F0A' : '#7A6E58'} />}
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  );
}

const cs = StyleSheet.create({
  header:        { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16, borderBottomWidth: 1, borderBottomColor: '#7DC87A22' },
  title:         { fontSize: 14, fontWeight: '600', color: '#F5EDD8' },
  contextCard:   { marginHorizontal: 16, marginTop: 12, backgroundColor: '#0D1A0F', borderRadius: 10, padding: 10, borderWidth: 1, borderColor: '#7DC87A14' },
  contextCourse: { fontSize: 13, fontWeight: '600', color: '#F5EDD8', marginBottom: 2 },
  contextMeta:   { fontSize: 10, color: '#B8A882' },
  emptyText:     { color: '#7A6E58', textAlign: 'center', marginTop: 40, fontSize: 14 },
  bubble:        { flex: 1, backgroundColor: '#0D1A0F', borderRadius: 12, padding: 10 },
  commenterName: { fontSize: 12, fontWeight: '700', color: '#F5EDD8' },
  commentTime:   { fontSize: 9, color: '#7A6E58' },
  commentBody:   { fontSize: 13, color: '#B8A882', lineHeight: 19 },
  composeRow:    { flexDirection: 'row', gap: 8, padding: 12, borderTopWidth: 1, borderTopColor: '#7DC87A22', alignItems: 'flex-end' },
  input:         { flex: 1, backgroundColor: '#0D1A0F', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, color: '#F5EDD8', fontSize: 13, maxHeight: 100, borderWidth: 1, borderColor: '#7DC87A22' },
  sendBtn:       { width: 36, height: 36, borderRadius: 18, backgroundColor: '#1A2E1C', alignItems: 'center', justifyContent: 'center' },
  sendBtnActive: { backgroundColor: '#C9A84C' },
});

// ─── Main Screen ─────────────────────────────────────────────────────────────
export default function FeedScreen({ navigation }) {
  const { user, profile } = useAuth();
  const uid = user?.id;

  const [tab,           setTab]           = useState('global');
  const [items,         setItems]         = useState([]);
  const [loading,       setLoading]       = useState(true);
  const [refreshing,    setRefreshing]    = useState(false);
  const [loadingMore,   setLoadingMore]   = useState(false);
  const [hasMore,       setHasMore]       = useState(false);
  const [likedIds,      setLikedIds]      = useState(new Set());
  const [commentCounts, setCommentCounts] = useState({});
  const [commentSheet,  setCommentSheet]  = useState(null);
  const [showPlusMenu,  setShowPlusMenu]  = useState(false);

  // Saved live round detection
  const [savedRound, setSavedRound] = useState(null);
  useEffect(() => {
    AsyncStorage.getItem(ROUND_STATE_KEY).then(raw => {
      if (!raw) return;
      try {
        const p = JSON.parse(raw);
        if (p?.startTs && Date.now() - p.startTs < ROUND_STALENESS_MS) {
          setSavedRound({ courseName: p.course?.name, currentHole: p.currentHole });
        }
      } catch {}
    });
  }, []);

  const offsetRef    = useRef(0);
  const followingRef = useRef([]);
  const activeTabRef = useRef('global');

  const fetchFollowingIds = async () => {
    if (!uid) return [];
    const { data } = await supabase.from('follows').select('following_id').eq('follower_id', uid);
    followingRef.current = (data ?? []).map(f => f.following_id);
    return followingRef.current;
  };

  const fetchPage = async ({ reset, currentTab }) => {
    if (!uid) return;
    const offset = reset ? 0 : offsetRef.current;
    let query = supabase.from('activity_feed')
      .select('id, user_id, type, content, round_id, likes, created_at')
      .order('created_at', { ascending: false })
      .range(offset, offset + PAGE_SIZE - 1);

    if (currentTab === 'following') {
      const fids = reset ? await fetchFollowingIds() : followingRef.current;
      if (fids.length === 0) return [];
      query = query.in('user_id', fids);
    }

    const { data } = await query;
    const rows = data ?? [];

    if (rows.length > 0) {
      const uids = [...new Set(rows.map(r => r.user_id))];
      const { data: profs } = await supabase.from('profiles').select('id, username, full_name, avatar_url').in('id', uids);
      const pm = {};
      (profs ?? []).forEach(p => { pm[p.id] = p; });
      rows.forEach(r => { r.username = pm[r.user_id]?.username; r.full_name = pm[r.user_id]?.full_name; r.avatar_url = pm[r.user_id]?.avatar_url; });

      const ids = rows.map(r => r.id);
      const { data: likesData } = await supabase.from('activity_likes').select('activity_id').eq('user_id', uid).in('activity_id', ids);
      setLikedIds(prev => { const ns = new Set(reset ? [] : prev); (likesData ?? []).forEach(l => ns.add(l.activity_id)); return ns; });

      const { data: cData } = await supabase.from('activity_comments').select('activity_id').in('activity_id', ids);
      const counts = {};
      (cData ?? []).forEach(c => { counts[c.activity_id] = (counts[c.activity_id] ?? 0) + 1; });
      setCommentCounts(prev => ({ ...(reset ? {} : prev), ...counts }));
    }

    offsetRef.current = offset + rows.length;
    setHasMore(rows.length === PAGE_SIZE);
    return rows;
  };

  const loadFeed = async (currentTab) => {
    if (!uid) return;
    setLoading(true);
    offsetRef.current = 0;
    try { const rows = await fetchPage({ reset: true, currentTab }); setItems(rows ?? []); }
    catch {} finally { setLoading(false); }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    try { const rows = await fetchPage({ reset: true, currentTab: activeTabRef.current }); setItems(rows ?? []); }
    catch {} finally { setRefreshing(false); }
  };

  const onEndReached = async () => {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);
    try { const rows = await fetchPage({ reset: false, currentTab: activeTabRef.current }); setItems(prev => [...prev, ...(rows ?? [])]); }
    catch {} finally { setLoadingMore(false); }
  };

  const switchTab = (newTab) => {
    if (newTab === activeTabRef.current) return;
    activeTabRef.current = newTab;
    setTab(newTab);
    setItems([]);
    loadFeed(newTab);
  };

  const handleLike = async (item, isLiked) => {
    if (!uid) return;
    setItems(prev => prev.map(i => i.id === item.id ? { ...i, likes: isLiked ? Math.max(0, i.likes - 1) : i.likes + 1 } : i));
    setLikedIds(prev => { const ns = new Set(prev); isLiked ? ns.delete(item.id) : ns.add(item.id); return ns; });
    try {
      if (isLiked) {
        await supabase.from('activity_likes').delete().eq('activity_id', item.id).eq('user_id', uid);
        await supabase.from('activity_feed').update({ likes: Math.max(0, item.likes - 1) }).eq('id', item.id);
      } else {
        await supabase.from('activity_likes').insert({ activity_id: item.id, user_id: uid });
        await supabase.from('activity_feed').update({ likes: item.likes + 1 }).eq('id', item.id);
      }
    } catch {
      setItems(prev => prev.map(i => i.id === item.id ? { ...i, likes: item.likes } : i));
      setLikedIds(prev => { const ns = new Set(prev); isLiked ? ns.add(item.id) : ns.delete(item.id); return ns; });
    }
  };

  useFocusEffect(useCallback(() => {
    (async () => {
      let defaultTab = 'global';
      if (uid) {
        const { count } = await supabase.from('follows').select('*', { count: 'exact', head: true }).eq('follower_id', uid);
        if ((count ?? 0) > 0) defaultTab = 'following';
      }
      activeTabRef.current = defaultTab;
      setTab(defaultTab);
      loadFeed(defaultTab);
    })();
  }, []));

  // ── List header: just the feed tabs (slim) ──
  const ListHeader = () => (
    <View>
      {/* Resume banner (only when a live round is in progress) */}
      {savedRound && (
        <TouchableOpacity style={s.resumeBanner} onPress={() => navigation.navigate('LiveRound')} activeOpacity={0.8}>
          <View style={s.resumeDot} />
          <Text style={s.resumeText}>Resume: {savedRound.courseName ?? 'round'} \u00B7 Hole {savedRound.currentHole}</Text>
          <Ionicons name="chevron-forward" size={14} color="#7DC87A" />
        </TouchableOpacity>
      )}

      {/* Feed tabs */}
      <View style={s.tabRow}>
        {[['following', 'FOLLOWING'], ['global', 'GLOBAL']].map(([key, label]) => (
          <TouchableOpacity key={key} style={[s.tab, tab === key && s.tabActive]} onPress={() => switchTab(key)} activeOpacity={0.7}>
            <Text style={[s.tabText, tab === key && s.tabTextActive]}>{label}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );

  return (
    <SafeAreaView style={s.container}>
      {/* Header */}
      <View style={s.header}>
        <View>
          <Text style={s.wordmark}>CLOCKED</Text>
          <Text style={s.tagline}>GOLF AS A SPORT.</Text>
        </View>
        <View style={s.headerRight}>
          {/* + menu for secondary actions */}
          <TouchableOpacity onPress={() => setShowPlusMenu(!showPlusMenu)} activeOpacity={0.7} accessibilityLabel="More actions" style={s.headerIcon}>
            <Ionicons name={showPlusMenu ? 'close' : 'add'} size={20} color="#B8A882" />
          </TouchableOpacity>
          <TouchableOpacity onPress={() => navigation.navigate('Notifications')} activeOpacity={0.7} accessibilityLabel="Notifications" style={s.headerIcon}>
            <Ionicons name="notifications-outline" size={20} color="#B8A882" />
          </TouchableOpacity>
          <TouchableOpacity onPress={() => navigation.navigate('SearchUsers')} activeOpacity={0.7} accessibilityLabel="Search" style={s.headerIcon}>
            <Ionicons name="search-outline" size={20} color="#B8A882" />
          </TouchableOpacity>
        </View>
      </View>

      {/* Plus menu dropdown */}
      {showPlusMenu && (
        <View style={s.plusMenu}>
          <TouchableOpacity style={s.plusMenuItem} onPress={() => { setShowPlusMenu(false); navigation.navigate('Log'); }} activeOpacity={0.8}>
            <Ionicons name="add-circle-outline" size={16} color="#7A6E58" />
            <Text style={s.plusMenuText}>Log a round</Text>
          </TouchableOpacity>
          <TouchableOpacity style={s.plusMenuItem} onPress={() => { setShowPlusMenu(false); navigation.navigate('LiveRound'); }} activeOpacity={0.8}>
            <Ionicons name="play-outline" size={16} color="#7A6E58" />
            <Text style={s.plusMenuText}>Play on the clock</Text>
          </TouchableOpacity>
        </View>
      )}

      <FlatList
        data={items}
        keyExtractor={(item, index) => item.id ? `${item.id}-${index}` : `feed-${index}`}
        ListHeaderComponent={ListHeader}
        renderItem={({ item }) => (
          <FeedItem
            item={item} userId={uid} navigation={navigation}
            likedIds={likedIds} commentCounts={commentCounts}
            onLike={handleLike} onComment={setCommentSheet}
          />
        )}
        ItemSeparatorComponent={() => <View style={s.divider} />}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#C9A84C" />}
        onEndReached={onEndReached}
        onEndReachedThreshold={0.3}
        ListEmptyComponent={
          loading ? <ActivityIndicator color="#C9A84C" style={{ marginTop: 40 }} />
          : <View style={s.emptyState}>
              <Text style={s.emptyText}>No activity yet.</Text>
              <Text style={s.emptyHint}>Follow players or play a round to fill your feed.</Text>
              <Text style={s.emptyFollowHint}>Follow players to see their rounds here.</Text>
              <TouchableOpacity onPress={() => navigation.navigate('SearchUsers')} style={s.emptyFollowBtn} activeOpacity={0.8}>
                <Text style={s.emptyFollowBtnText}>FIND GOLFERS</Text>
              </TouchableOpacity>
            </View>
        }
        ListFooterComponent={loadingMore ? <ActivityIndicator color="#C9A84C" style={{ paddingVertical: 20 }} /> : null}
        contentContainerStyle={{ paddingBottom: 20, flexGrow: 1 }}
      />

      {/* Comment sheet */}
      <CommentSheet
        visible={!!commentSheet}
        activity={commentSheet}
        userId={uid}
        onClose={() => setCommentSheet(null)}
        onPosted={(activityId) => {
          setCommentCounts(prev => ({ ...prev, [activityId]: (prev[activityId] ?? 0) + 1 }));
        }}
      />
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  container:   { flex: 1, backgroundColor: '#090F0A' },

  // Header — compact
  header:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 12, paddingBottom: 8 },
  wordmark:    { fontSize: 13, fontWeight: '700', color: '#C9A84C', letterSpacing: 5 },
  tagline:     { fontSize: 9, color: '#C9A84C88', letterSpacing: 2, marginTop: 1 },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  headerIcon:  { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },

  // Plus menu
  plusMenu:     { flexDirection: 'row', justifyContent: 'flex-end', gap: 16, paddingHorizontal: 20, paddingBottom: 8 },
  plusMenuItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  plusMenuText: { fontSize: 11, color: '#7A6E58', fontWeight: '600' },

  // Resume banner
  resumeBanner: { flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: 16, marginTop: 4, marginBottom: 4, backgroundColor: '#7DC87A0D', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, borderWidth: 1, borderColor: '#7DC87A22' },
  resumeDot:    { width: 6, height: 6, borderRadius: 3, backgroundColor: '#7DC87A' },
  resumeText:   { flex: 1, fontSize: 12, color: '#7DC87A', fontWeight: '600' },

  // Tabs
  tabRow:      { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: '#7DC87A18' },
  tab:         { flex: 1, paddingVertical: 10, alignItems: 'center' },
  tabActive:   { borderBottomWidth: 2, borderBottomColor: '#C9A84C' },
  tabText:     { fontSize: 10, fontWeight: '700', color: '#7A6E58', letterSpacing: 2 },
  tabTextActive: { color: '#C9A84C' },

  // Feed card
  feedCard:      { paddingHorizontal: 16, paddingVertical: 14 },
  feedCardLive:  { borderLeftWidth: 3, borderLeftColor: '#7DC87A', paddingLeft: 13, backgroundColor: 'rgba(125,200,122,0.03)' },
  avatarLiveDot: { position: 'absolute', bottom: 0, right: 0, width: 8, height: 8, borderRadius: 4, backgroundColor: '#7DC87A', borderWidth: 1.5, borderColor: '#131A14' },
  handle:        { fontSize: 13, fontWeight: '700', color: '#F5EDD8' },
  timestamp:     { fontSize: 9, color: 'rgba(184,168,130,0.5)' },
  actionLabel:   { fontSize: 12, color: '#B8A882', marginTop: 1, marginBottom: 6 },
  postText:      { fontSize: 14, color: '#F5EDD8', lineHeight: 20, marginTop: 4, marginBottom: 6 },
  divider:       { height: 1, backgroundColor: '#7DC87A0D', marginLeft: 62 },

  // Round card
  roundCard:      { marginTop: 6, backgroundColor: '#0D1A0F', borderRadius: 10, padding: 10, borderWidth: 1, borderColor: '#7DC87A14' },
  roundCardClocked: { borderColor: '#C9A84C44' },
  roundCourse:    { fontSize: 13, fontWeight: '600', color: '#F5EDD8', marginBottom: 2 },
  roundDetails:   { fontSize: 10, color: '#B8A882' },
  clockResult:    { fontSize: 10, color: '#7DC87A', marginTop: 2, fontWeight: '500' },

  // Score badge (redesigned — labeled)
  scoreBadge:     { borderWidth: 1, borderColor: '#7DC87A33', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 5, alignItems: 'center', minWidth: 48 },
  scoreBadgeNum:  { fontSize: 17, fontWeight: '700', fontVariant: ['tabular-nums'] },
  scoreBadgeLabel:{ fontSize: 7, fontWeight: '700', color: '#7A6E58', letterSpacing: 1, marginTop: 1 },

  // Live banner
  liveBanner:    { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#7DC87A0D', borderRadius: 8, padding: 8, marginTop: 6, borderWidth: 1, borderColor: '#7DC87A22' },
  liveDot:       { width: 6, height: 6, borderRadius: 3, backgroundColor: '#7DC87A' },
  liveLabel:     { fontSize: 12, color: '#F5EDD8', fontWeight: '600' },

  // Milestone card
  milestoneCard:   { marginTop: 6, backgroundColor: '#C9A84C18', borderWidth: 1, borderColor: '#C9A84C55', borderRadius: 14, padding: 16, flexDirection: 'row', alignItems: 'center', gap: 12 },
  milestoneIcon:   { width: 40, height: 40, borderRadius: 20, backgroundColor: '#C9A84C22', alignItems: 'center', justifyContent: 'center' },
  milestoneTitle:  { fontSize: 14, fontWeight: '700', color: '#F5EDD8', marginBottom: 2 },
  milestoneBody:   { fontSize: 12, color: '#B8A882', lineHeight: 17 },

  // Actions
  actionBar:     { flexDirection: 'row', gap: 16, marginTop: 8 },
  actionBtn:     { flexDirection: 'row', alignItems: 'center', gap: 4, minWidth: 40, minHeight: 36, justifyContent: 'center' },
  actionCount:   { fontSize: 12, color: '#7A6E58' },

  // States
  emptyState:      { alignItems: 'center', justifyContent: 'center', paddingVertical: 60, paddingHorizontal: 32 },
  emptyText:       { fontSize: 15, color: '#7A6E58', fontWeight: '500', marginBottom: 6 },
  emptyHint:       { fontSize: 12, color: '#7A6E5888', textAlign: 'center', lineHeight: 18 },
  emptyFollowHint: { fontSize: 13, color: '#7A6E58', textAlign: 'center', marginTop: 8, marginBottom: 20 },
  emptyFollowBtn:  { backgroundColor: '#C9A84C22', borderWidth: 1, borderColor: '#C9A84C55', borderRadius: 12, paddingVertical: 12, paddingHorizontal: 24 },
  emptyFollowBtnText: { fontSize: 13, fontWeight: '700', color: '#C9A84C', letterSpacing: 1 },
});
