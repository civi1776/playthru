// ─── Feed — the front door ───────────────────────────────────────────────────
// Compact header, feed-forward. No hero CTA — Play lives in the tab bar.

import { useState, useRef, useCallback, useEffect } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, TextInput, StyleSheet,
  ActivityIndicator, RefreshControl, Modal, KeyboardAvoidingView, Platform,
  Animated, Easing, Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import InitialsAvatar from '../components/InitialsAvatar';
import CourseAvatar from '../components/CourseAvatar';
import { sendPushToUser } from '../lib/notifications';
import { scoreTier, COLOR, RADIUS } from '../lib/theme';
import { useActiveRoundInset } from '../lib/activeRound';
import ScreenHeader from '../components/ScreenHeader';

// "Very recent" window for the live pulse indicator — purely presentational,
// mirrors the freshness cue used on the live-round banner elsewhere in the app.
const RECENT_WINDOW_MS = 5 * 60 * 1000;

// ─── PulseDot — HUD-style radar ping ────────────────────────────────────────
// A solid dot with an expanding, fading ring behind it. Native-driver only
// (opacity + scale), so it's cheap even when a few instances are mounted at
// once in a scrolling list.
function PulseDot({ color = COLOR.green, size = 6 }) {
  const pulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 900, easing: Easing.out(Easing.ease), useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration: 0, useNativeDriver: true }),
        Animated.delay(500),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, []);

  const scale   = pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 2.2] });
  const opacity = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.85, 0] });

  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Animated.View
        pointerEvents="none"
        style={{
          position: 'absolute', width: size, height: size, borderRadius: size / 2,
          backgroundColor: color, opacity, transform: [{ scale }],
        }}
      />
      <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: color }} />
    </View>
  );
}

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

// ─── Round Content Card ──────────────────────────────────────────────────────
function RoundContentCard({ content, navigation }) {
  const isOnTheClock = content?.round_format === 'clocked';
  // Legacy fallback for old-format (non-clocked) rounds logged before the
  // Clocked Score rewrite — these real rows still carry the deprecated 0-5
  // pop_score field. No new rounds create it, but existing history does, so
  // convert it to the current 0-100 scale for display rather than showing
  // the old number.
  const pop = content?.pop_score;
  const legacyClockedScore = pop != null ? Math.round(pop * 20) : null;
  const legacyTier = legacyClockedScore != null ? scoreTier(legacyClockedScore) : null;
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
  // Sign of the clock delta drives color/icon — "color IS information" per
  // the design system, so a round that ran over should read red, not green.
  const beatTheClock = (content?.total_elapsed != null && content?.total_time_par != null)
    ? (content.total_time_par - content.total_elapsed) >= 0
    : null;

  // "Hero" pop for a round worth noticing: an APEX/CONTENDER legacy score,
  // or a clearly strong on-the-clock result. Presentational thresholds only.
  const legacyIsHero = false; // legacy (pre-clock) rounds stay flat; only Clocked rounds earn the glow
  const clockIsHero  = isOnTheClock && teamScore != null && teamScore >= 10;
  const isHero = legacyIsHero || clockIsHero;
  const heroColor = clockIsHero ? COLOR.gold : (legacyTier?.color ?? COLOR.gold);

  return (
    <TouchableOpacity
      style={[
        s.roundCard,
        isOnTheClock && s.roundCardClocked,
        isHero && {
          borderColor: `${heroColor}77`, backgroundColor: `${heroColor}12`,
          shadowColor: heroColor, shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.45, shadowRadius: 10, elevation: 4,
        },
      ]}
      onPress={() => content?.course_name && navigation?.navigate('CourseProfile', { course: { name: content.course_name } })}
      activeOpacity={0.85}
    >
      {/* Clock badge for on-the-clock rounds */}
      {isOnTheClock && (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 6 }}>
          <Ionicons name="timer-outline" size={11} color={COLOR.gold} />
          <Text style={s.clockTag}>ON THE CLOCK</Text>
          {isHero && (
            <Text style={[s.clockTag, { color: heroColor, marginLeft: 2 }]}>
              {'· '}{legacyIsHero ? legacyTier.name : 'STRONG ROUND'}
            </Text>
          )}
        </View>
      )}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        {content?.course_name ? <CourseAvatar courseName={content.course_name} city={content.city ?? null} size={isHero ? 48 : 44} /> : null}
        <View style={{ flex: 1 }}>
          <Text style={s.roundCourse} numberOfLines={2}>{content?.course_name || 'Quick Play'}</Text>
          {parts.length > 0 && (
            <Text style={s.roundDetails} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.85}>
              {parts.join(' \u00B7 ')}
            </Text>
          )}
          {clockResult && (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: 3 }}>
              <Ionicons
                name={beatTheClock === false ? 'trending-down' : 'trending-up'}
                size={11}
                color={beatTheClock === false ? COLOR.red : COLOR.green}
              />
              <Text style={[s.clockResult, { color: beatTheClock === false ? COLOR.red : COLOR.green }]}>{clockResult}</Text>
            </View>
          )}
        </View>
        {/* Score badge \u2014 hero number treatment */}
        {isOnTheClock && teamScore != null ? (
          <View style={[s.scoreBadge, { borderColor: `${heroColor}55` }, isHero && s.scoreBadgeHero]}>
            <Text style={[s.scoreBadgeNum, { color: heroColor, fontSize: isHero ? 28 : 22 }]}>
              {teamScore > 0 ? `+${teamScore}` : teamScore}
            </Text>
            <Text style={[s.scoreBadgeLabel, { color: heroColor }]}>PTS</Text>
          </View>
        ) : legacyClockedScore != null ? (
          <View style={[s.scoreBadge, { borderColor: `${heroColor}55` }, isHero && s.scoreBadgeHero]}>
            <Text style={[s.scoreBadgeNum, { color: legacyTier.color, fontSize: isHero ? 28 : 22 }]}>{legacyClockedScore}</Text>
            <Text style={s.scoreBadgeLabel}>LEGACY</Text>
          </View>
        ) : null}
        <Ionicons name="chevron-forward" size={14} color={COLOR.dim} style={{ marginLeft: 2 }} />
      </View>
    </TouchableOpacity>
  );
}

// ─── Feed Item ───────────────────────────────────────────────────────────────
// Each row reads like a telemetry line: a colored accent edge keyed to what
// happened, a live pulse when it's fresh, a hero glow when it's a great
// round, a badge (not a text block) for milestones.
function FeedItem({ item, userId, navigation, likedIds, commentCounts, onLike, onComment }) {
  const handle = item.username ? `@${item.username}` : (item.full_name?.split(' ')[0] ?? 'Golfer');
  const liked  = likedIds.has(item.id);
  const cCount = commentCounts[item.id] ?? 0;

  const isOnTheClock = item.content?.round_format === 'clocked';

  // Accent color — keys the left edge + live pulse to what kind of thing
  // this is, reusing the same tier logic as the round card so the signal is
  // consistent whether you're scanning the edge or reading the number.
  const accentColor = (() => {
    if (item.type === 'live_round_started') return COLOR.green;
    if (item.type === 'milestone') return COLOR.gold;
    if (item.type === 'course_review') return COLOR.green;
    if (item.type === 'round_logged') {
      if (isOnTheClock) {
        if (item.content?.team_score != null) return COLOR.gold;
        if (item.content?.pop_score != null) return scoreTier(Math.round(item.content.pop_score * 20)).color;
      }
      return COLOR.dim;
    }
    return COLOR.dim;
  })();

  const isRecent = !!item.created_at && (Date.now() - new Date(item.created_at).getTime()) < RECENT_WINDOW_MS;

  const actionLabel = (() => {
    switch (item.type) {
      case 'round_logged': {
        if (!isOnTheClock) return 'logged a round';
        const d = item.content?.difficulty;
        const diffTag = d === 'pro' ? ' \u00B7 PRO' : d === 'beginner' ? ' \u00B7 BEGINNER' : '';
        return `played on the clock${diffTag}`;
      }
      case 'live_round_started': return null;
      case 'milestone':          return null;
      case 'course_review':      return `reviewed ${item.content?.course_name ?? 'a course'}`;
      case 'user_post':          return null;
      default:                   return null;
    }
  })();

  const isLive = item.type === 'live_round_started';

  return (
    <View style={[s.feedCard, { borderLeftColor: `${accentColor}88` }, isLive && s.feedCardLive]}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10 }}>
        <TouchableOpacity onPress={() => navigation.navigate('PublicProfile', { userId: item.user_id })} activeOpacity={0.8}>
          <View>
            <InitialsAvatar name={item.full_name} size={36} avatarUrl={item.avatar_url} />
            {isLive && (
              <View style={s.avatarLiveDot}>
                <PulseDot color={COLOR.green} size={8} />
              </View>
            )}
          </View>
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 2 }}>
            <TouchableOpacity onPress={() => navigation.navigate('PublicProfile', { userId: item.user_id })} activeOpacity={0.8}>
              <Text style={s.handle}>{handle}</Text>
            </TouchableOpacity>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
              {isRecent && <PulseDot color={COLOR.green} size={5} />}
              <Text style={s.timestamp}>{timeAgo(item.created_at)}</Text>
            </View>
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
              <PulseDot color={COLOR.green} size={6} />
              <Text style={s.liveLabel}>Playing at {item.content?.course_name ?? 'a course'}</Text>
              <View style={s.liveTag}><Text style={s.liveTagText}>LIVE</Text></View>
            </View>
          )}

          {item.type === 'milestone' && item.content?.title && (
            <View style={s.milestoneCard}>
              <View style={s.milestoneBadgeRing}>
                <View style={s.milestoneBadgeCore}>
                  <Ionicons name="trophy" size={20} color={COLOR.bg} />
                </View>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.milestoneEyebrow}>ACHIEVEMENT UNLOCKED</Text>
                <Text style={s.milestoneTitle}>{item.content.title}</Text>
                {item.content.body && <Text style={s.milestoneBody}>{item.content.body}</Text>}
              </View>
            </View>
          )}

          {/* Actions */}
          <View style={s.actionBar}>
            <TouchableOpacity style={s.actionBtn} onPress={() => onLike(item, liked)} activeOpacity={0.7}>
              <Ionicons name={liked ? 'thumbs-up' : 'thumbs-up-outline'} size={15} color={liked ? COLOR.green : COLOR.muted} />
              <Text style={[s.actionCount, liked && { color: COLOR.green }]}>{item.likes ?? 0}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={s.actionBtn} onPress={() => onComment(item)} activeOpacity={0.7}>
              <Ionicons name="chatbubble-outline" size={14} color={COLOR.muted} />
              <Text style={s.actionCount}>{cCount}</Text>
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

        // Push + in-app inbox row (both written server-side by send-push)
        sendPushToUser(activity.user_id, `${name} commented`, `"${snippet}"`, 'comment',
          { activity_id: activity.id, round_id: activity.round_id ?? null }).catch(() => {});
      }
    } catch {} finally { setPosting(false); }
  };

  if (!visible) return null;

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView style={{ flex: 1, backgroundColor: COLOR.bg }}>
        {/* Header */}
        <View style={cs.header}>
          <Text style={cs.title}>Comments</Text>
          <TouchableOpacity onPress={onClose} activeOpacity={0.7}>
            <Ionicons name="close" size={22} color={COLOR.muted} />
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
              ? <ActivityIndicator color={COLOR.gold} style={{ marginTop: 40 }} />
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
              placeholderTextColor={COLOR.dim}
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
                ? <ActivityIndicator size="small" color={COLOR.bg} />
                : <Ionicons name="arrow-up" size={16} color={draft.trim() ? COLOR.bg : COLOR.dim} />}
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  );
}

const cs = StyleSheet.create({
  header:        { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16, borderBottomWidth: 1, borderBottomColor: '#7DC87A22' },
  title:         { fontSize: 14, fontWeight: '600', color: COLOR.cream },
  contextCard:   { marginHorizontal: 16, marginTop: 12, backgroundColor: COLOR.surface, borderRadius: RADIUS.sm, padding: 10, borderWidth: 1, borderColor: '#7DC87A14' },
  contextCourse: { fontSize: 13, fontWeight: '600', color: COLOR.cream, marginBottom: 2 },
  contextMeta:   { fontSize: 10, color: COLOR.muted },
  emptyText:     { color: COLOR.dim, textAlign: 'center', marginTop: 40, fontSize: 14 },
  bubble:        { flex: 1, backgroundColor: COLOR.surface, borderRadius: RADIUS.md, padding: 10 },
  commenterName: { fontSize: 12, fontWeight: '700', color: COLOR.cream },
  commentTime:   { fontSize: 9, color: COLOR.dim },
  commentBody:   { fontSize: 13, color: COLOR.muted, lineHeight: 19 },
  composeRow:    { flexDirection: 'row', gap: 8, padding: 12, borderTopWidth: 1, borderTopColor: '#7DC87A22', alignItems: 'flex-end' },
  input:         { flex: 1, backgroundColor: COLOR.surface, borderRadius: RADIUS.md, paddingHorizontal: 14, paddingVertical: 10, color: COLOR.cream, fontSize: 13, maxHeight: 100, borderWidth: 1, borderColor: '#7DC87A22' },
  sendBtn:       { width: 36, height: 36, borderRadius: RADIUS.lg, backgroundColor: COLOR.surfaceAlt, alignItems: 'center', justifyContent: 'center' },
  sendBtnActive: { backgroundColor: COLOR.gold },
});

// ─── Main Screen ─────────────────────────────────────────────────────────────
export default function FeedScreen({ navigation }) {
  // Extra bottom padding while the floating ROUND IN PROGRESS banner is up,
  // so the last card isn't hidden underneath it.
  const bannerInset = useActiveRoundInset();
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

  // ── List header: tournament promo + feed tabs (slim) ──
  const ListHeader = () => (
    <View>
      {/* Tournament promo banner */}
      <TouchableOpacity style={s.tourneyBanner} onPress={() => navigation.navigate('Tournament')} activeOpacity={0.85}>
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 3 }}>
            <PulseDot color={COLOR.green} size={5} />
            <Text style={s.tourneyBannerEyebrow}>THE FIRST CLOCKED EVENT</Text>
          </View>
          <Text style={s.tourneyBannerTitle}>Coming to South Florida. Request an invitation.</Text>
        </View>
        <Ionicons name="chevron-forward" size={18} color={COLOR.green} />
      </TouchableOpacity>

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
      <ScreenHeader
        title="CLOCKED" brand
        right={[
          { icon: 'book-outline', onPress: () => navigation.navigate('RulesScreen'), label: 'Rules of Clocked Golf' },
          { icon: 'notifications-outline', onPress: () => navigation.navigate('Notifications'), label: 'Notifications' },
          { icon: 'search-outline', onPress: () => navigation.navigate('SearchUsers'), label: 'Search' },
        ]}
      />


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
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLOR.gold} />}
        onEndReached={onEndReached}
        onEndReachedThreshold={0.3}
        ListEmptyComponent={
          loading ? <ActivityIndicator color={COLOR.gold} style={{ marginTop: 40 }} />
          : <View style={s.emptyState}>
              <Text style={s.emptyText}>No activity yet.</Text>
              <Text style={s.emptyHint}>Follow players or play a round to fill your feed.</Text>
              <Text style={s.emptyFollowHint}>Follow players to see their rounds here.</Text>
              <TouchableOpacity onPress={() => navigation.navigate('SearchUsers')} style={s.emptyFollowBtn} activeOpacity={0.8}>
                <Text style={s.emptyFollowBtnText}>FIND GOLFERS</Text>
              </TouchableOpacity>
            </View>
        }
        ListFooterComponent={loadingMore ? <ActivityIndicator color={COLOR.gold} style={{ paddingVertical: 20 }} /> : null}
        contentContainerStyle={{ paddingBottom: 20 + bannerInset, flexGrow: 1 }}
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
  container:   { flex: 1, backgroundColor: COLOR.bg },

  // Header — compact
  header:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 12, paddingBottom: 8 },
  wordmark:    { fontSize: 13, fontWeight: '700', color: COLOR.gold, letterSpacing: 5 },

  // Plus menu

  // Resume banner
  resumeBanner: { flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: 16, marginTop: 4, marginBottom: 4, backgroundColor: '#7DC87A0D', borderRadius: RADIUS.sm, paddingHorizontal: 12, paddingVertical: 8, borderWidth: 1, borderColor: '#7DC87A22' },
  resumeDot:    { width: 6, height: 6, borderRadius: RADIUS.xs, backgroundColor: COLOR.green },
  resumeText:   { flex: 1, fontSize: 12, color: COLOR.green, fontWeight: '600' },

  // Tournament promo
  tourneyBanner:        { flexDirection: 'row', alignItems: 'center', gap: 10, marginHorizontal: 16, marginTop: 8, marginBottom: 4, backgroundColor: 'rgba(125,200,122,0.08)', borderRadius: RADIUS.md, paddingHorizontal: 14, paddingVertical: 12, borderWidth: 1, borderColor: '#7DC87A33' },
  tourneyBannerEyebrow: { fontSize: 9, fontWeight: '700', color: COLOR.green, letterSpacing: 1.5, marginBottom: 3 },
  tourneyBannerTitle:   { fontSize: 13, fontWeight: '600', color: COLOR.cream },

  // Tabs
  tabRow:      { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: '#7DC87A18' },
  tab:         { flex: 1, paddingVertical: 10, alignItems: 'center' },
  tabActive:   { borderBottomWidth: 2, borderBottomColor: COLOR.gold },
  tabText:     { fontSize: 10, fontWeight: '700', color: COLOR.dim, letterSpacing: 2 },
  tabTextActive: { color: COLOR.gold },

  // Feed card — a telemetry tile, not a social post: flat surface, a colored
  // left edge keyed to what happened, no gradients.
  feedCard:      {
    marginHorizontal: 12, marginTop: 10, paddingHorizontal: 14, paddingVertical: 14,
    backgroundColor: 'rgba(255,255,255,0.015)', borderRadius: RADIUS.md,
    borderWidth: 1, borderColor: 'rgba(125,200,122,0.08)', borderLeftWidth: 3,
  },
  feedCardLive:  { backgroundColor: 'rgba(125,200,122,0.05)', borderColor: 'rgba(125,200,122,0.18)' },
  avatarLiveDot: {
    position: 'absolute', bottom: -2, right: -2, width: 13, height: 13, borderRadius: 6.5,
    backgroundColor: COLOR.bg, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: 'rgba(125,200,122,0.5)',
  },
  handle:        { fontSize: 13, fontWeight: '700', color: COLOR.cream },
  timestamp:     { fontSize: 9, color: 'rgba(184,168,130,0.5)' },
  actionLabel:   { fontSize: 12, color: COLOR.muted, marginTop: 1, marginBottom: 6 },
  postText:      { fontSize: 14, color: COLOR.cream, lineHeight: 20, marginTop: 4, marginBottom: 6 },
  divider:       { height: 2 },

  // Round card — the inner readout panel
  roundCard:      { marginTop: 6, backgroundColor: COLOR.surface, borderRadius: RADIUS.md, padding: 11, borderWidth: 1, borderColor: '#7DC87A14' },
  roundCardClocked: { borderColor: '#C9A84C44' },
  roundCourse:    { fontSize: 13, fontWeight: '600', color: COLOR.cream, marginBottom: 2 },
  roundDetails:   { fontSize: 10, color: COLOR.muted },
  clockResult:    { fontSize: 10, fontWeight: '700', letterSpacing: 0.3 },
  clockTag:       { fontSize: 10, color: COLOR.gold, fontWeight: '700', letterSpacing: 1.5 },

  // Score badge — hero number treatment for a great round
  scoreBadge:     { borderWidth: 1, borderColor: '#7DC87A33', borderRadius: RADIUS.sm, paddingHorizontal: 10, paddingVertical: 5, alignItems: 'center', minWidth: 48, minHeight: 52, justifyContent: 'center' },
  scoreBadgeHero: { paddingHorizontal: 13, paddingVertical: 7, borderWidth: 1.5 },
  scoreBadgeNum:  { fontWeight: '200', fontVariant: ['tabular-nums'], letterSpacing: -0.5 },
  scoreBadgeLabel:{ fontSize: 7, fontWeight: '700', color: COLOR.dim, letterSpacing: 1, marginTop: 1 },

  // Live banner
  liveBanner:    { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#7DC87A0D', borderRadius: RADIUS.sm, padding: 8, marginTop: 6, borderWidth: 1, borderColor: '#7DC87A22' },
  liveLabel:     { fontSize: 12, color: COLOR.cream, fontWeight: '600', flex: 1 },
  liveTag:       { backgroundColor: 'rgba(125,200,122,0.15)', borderRadius: RADIUS.xs, paddingHorizontal: 6, paddingVertical: 2 },
  liveTagText:   { fontSize: 8, fontWeight: '800', color: COLOR.green, letterSpacing: 1.5 },

  // Milestone — a badge, not a text block
  milestoneCard:   {
    marginTop: 6, backgroundColor: '#C9A84C14', borderWidth: 1, borderColor: '#C9A84C55', borderRadius: RADIUS.lg, padding: 14,
    flexDirection: 'row', alignItems: 'center', gap: 14,
    shadowColor: COLOR.gold, shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 3,
  },
  milestoneBadgeRing: {
    width: 52, height: 52, borderRadius: 26, borderWidth: 1.5, borderColor: '#C9A84C77',
    alignItems: 'center', justifyContent: 'center',
  },
  milestoneBadgeCore: {
    width: 38, height: 38, borderRadius: 19, backgroundColor: COLOR.gold,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: COLOR.goldBright, shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.6, shadowRadius: 6, elevation: 2,
  },
  milestoneEyebrow: { fontSize: 9, fontWeight: '700', color: COLOR.gold, letterSpacing: 2, marginBottom: 2, textTransform: 'uppercase' },
  milestoneTitle:  { fontSize: 15, fontWeight: '800', color: COLOR.cream, marginBottom: 2 },
  milestoneBody:   { fontSize: 12, color: COLOR.muted, lineHeight: 17 },

  // Actions
  actionBar:     { flexDirection: 'row', gap: 16, marginTop: 8 },
  actionBtn:     { flexDirection: 'row', alignItems: 'center', gap: 4, minWidth: 40, minHeight: 36, justifyContent: 'center' },
  actionCount:   { fontSize: 12, color: COLOR.dim },

  // States
  emptyState:      { alignItems: 'center', justifyContent: 'center', paddingVertical: 60, paddingHorizontal: 32 },
  emptyText:       { fontSize: 15, color: COLOR.dim, fontWeight: '500', marginBottom: 6 },
  emptyHint:       { fontSize: 12, color: '#7A6E5888', textAlign: 'center', lineHeight: 18 },
  emptyFollowHint: { fontSize: 13, color: COLOR.dim, textAlign: 'center', marginTop: 8, marginBottom: 20 },
  emptyFollowBtn:  { backgroundColor: '#C9A84C22', borderWidth: 1, borderColor: '#C9A84C55', borderRadius: RADIUS.md, paddingVertical: 12, paddingHorizontal: 24 },
  emptyFollowBtnText: { fontSize: 13, fontWeight: '700', color: COLOR.gold, letterSpacing: 1 },
});
