import { useState, useRef, useCallback, useEffect } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet,
  ActivityIndicator, RefreshControl, Modal, TextInput,
  KeyboardAvoidingView, Platform, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import InitialsAvatar from '../components/InitialsAvatar';
import ChallengeButton from '../components/ChallengeButton';
import { sendPushToUser } from '../lib/notifications';

const PAGE_SIZE = 20;

// ─── Helpers ──────────────────────────────────────────────────────────────────
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

// ─── Skeleton ─────────────────────────────────────────────────────────────────
function SkeletonBlock({ width, height, style }) {
  return <View style={[{ backgroundColor: '#1A2E1C', borderRadius: 6 }, { width, height }, style]} />;
}

function SkeletonCard() {
  return (
    <View style={s.feedCard}>
      <View style={{ flexDirection: 'row', gap: 10, alignItems: 'flex-start' }}>
        <SkeletonBlock width={40} height={40} style={{ borderRadius: 20 }} />
        <View style={{ flex: 1, gap: 8 }}>
          <SkeletonBlock width="55%" height={11} />
          <SkeletonBlock width="80%" height={11} />
          <SkeletonBlock width="100%" height={54} style={{ borderRadius: 10, marginTop: 4 }} />
        </View>
      </View>
    </View>
  );
}

// ─── Round Content Card ───────────────────────────────────────────────────────
function RoundContentCard({ content, navigation }) {
  const pop = content?.pop_score;
  const parts = [
    content?.holes     ? `${content.holes}h`             : null,
    content?.transport ?? null,
    content?.players   ? `${content.players}p`           : null,
    content?.duration_minutes ? formatTime(content.duration_minutes) : null,
  ].filter(Boolean);

  const leftBorderColor = pop != null
    ? pop >= 4.0 ? '#7DC87A'
    : pop >= 3.0 ? '#C9A84C'
    : '#5A5A5A'
    : '#7DC87A33';

  return (
    <TouchableOpacity
      style={[s.roundCard, { borderLeftWidth: 3, borderLeftColor: leftBorderColor }]}
      onPress={() => navigation?.navigate('CourseProfile', { course: { name: content?.course_name } })}
      activeOpacity={0.85}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <View style={{ flex: 1 }}>
          <Text style={s.roundCourse} numberOfLines={1}>{content?.course_name ?? '—'}</Text>
          {parts.length > 0 && <Text style={s.roundDetails}>{parts.join(' · ')}</Text>}
        </View>
        {pop != null && (
          <View style={[s.popBadge, { borderColor: popColor(pop) + '88', backgroundColor: popColor(pop) + '12' }]}>
            <Text style={[s.popScore, { color: popColor(pop) }]}>{pop.toFixed(1)}</Text>
            <Text style={[s.popLabel, { color: popColor(pop) }]}>CLK</Text>
          </View>
        )}
      </View>
      {(content?.verified || content?.is_best) && (
        <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
          {content.verified && (
            <View style={s.verifiedBadge}>
              <Ionicons name="checkmark-circle" size={10} color="#7DC87A" />
              <Text style={s.verifiedText}>VERIFIED</Text>
            </View>
          )}
          {content.is_best && (
            <View style={s.bestBadge}>
              <Ionicons name="flash" size={10} color="#C9A84C" />
              <Text style={s.bestText}>PERSONAL BEST</Text>
            </View>
          )}
        </View>
      )}
    </TouchableOpacity>
  );
}

// ─── Action Bar ───────────────────────────────────────────────────────────────
function ActionBar({ item, liked, commentCount, onLike, onComment }) {
  return (
    <View style={s.actionBar}>
      <TouchableOpacity style={s.actionBtn} onPress={onLike} activeOpacity={0.7} accessibilityLabel={liked ? 'Unlike' : 'Like'} accessibilityRole="button">
        <Ionicons name={liked ? 'thumbs-up' : 'thumbs-up-outline'} size={16} color={liked ? '#7DC87A' : '#7A6E58'} />
        {item.likes > 0 && <Text style={[s.actionCount, liked && { color: '#7DC87A' }]}>{item.likes}</Text>}
      </TouchableOpacity>
      <TouchableOpacity style={s.actionBtn} onPress={onComment} activeOpacity={0.7} accessibilityLabel={commentCount > 0 ? `Comment, ${commentCount} comments` : 'Comment'} accessibilityRole="button">
        <Ionicons name="chatbubble-outline" size={15} color="#7A6E58" />
        {commentCount > 0 && <Text style={s.actionCount}>{commentCount}</Text>}
      </TouchableOpacity>
    </View>
  );
}

// ─── Feed Item ────────────────────────────────────────────────────────────────
function FeedItem({ item, userId, navigation, likedIds, commentCounts, onLike, onComment, myBestScore }) {
  const handle = item.username ? `@${item.username}` : (item.full_name?.split(' ')[0] ?? 'Golfer');
  const liked  = likedIds.has(item.id);
  const cCount = commentCounts[item.id] ?? 0;

  const actionLabel = (() => {
    switch (item.type) {
      case 'round_logged':       return 'logged a round';
      case 'live_round_started': return null;
      case 'milestone':          return null;
      case 'course_review':      return `reviewed ${item.content?.course_name ?? 'a course'}`;
      case 'leaderboard':        return null;
      case 'user_post':          return null;
      case 'course_leader':      return null;
      case 'challenge_won':      return null;
      default:                   return 'posted an update';
    }
  })();

  const isLive = item.type === 'live_round_started';
  const isCourseLeader = item.type === 'course_leader';
  const isChallengeWon = item.type === 'challenge_won';
  return (
    <View style={[
      s.feedCard,
      isLive         && s.feedCardLive,
      isCourseLeader && s.feedCardCourseLeader,
      isChallengeWon && s.feedCardChallengeWon,
    ]}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10 }}>
        <TouchableOpacity onPress={() => navigation.navigate('PublicProfile', { userId: item.user_id })} activeOpacity={0.8}>
          <View>
            <InitialsAvatar name={item.full_name} size={40} />
            {isLive && <View style={s.avatarLiveDot} />}
          </View>
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 2 }}>
            <TouchableOpacity onPress={() => navigation.navigate('PublicProfile', { userId: item.user_id })} activeOpacity={0.8}>
              <Text style={s.handle}>{handle}</Text>
            </TouchableOpacity>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              {isLive && (
                <View style={s.liveNowBadge}>
                  <View style={s.liveNowDot} />
                  <Text style={s.liveNowText}>LIVE</Text>
                </View>
              )}
              <Text style={s.timestamp}>{timeAgo(item.created_at)}</Text>
            </View>
          </View>

          {actionLabel && <Text style={s.actionLabel}>{actionLabel}</Text>}

          {item.type === 'round_logged' && item.content && (
            <RoundContentCard content={item.content} navigation={navigation} />
          )}

          {item.type === 'user_post' && (
            <>
              {item.content?.text && <Text style={s.postText}>{item.content.text}</Text>}
              {item.content?.attached_round && (
                <RoundContentCard content={item.content.attached_round} navigation={navigation} />
              )}
            </>
          )}

          {isLive && (
            <View style={s.liveBanner}>
              <View style={s.liveDot} />
              <Ionicons name="golf" size={14} color="#7DC87A" style={{ marginRight: 6 }} />
              <View style={{ flex: 1 }}>
                <Text style={s.liveLabel}>Playing live at {item.content?.course_name ?? 'a course'}</Text>
                {(item.content?.holes || item.content?.transport) && (
                  <Text style={s.liveMeta}>{[item.content?.holes && `${item.content.holes} holes`, item.content?.transport].filter(Boolean).join(' · ')}</Text>
                )}
              </View>
            </View>
          )}

          {item.type === 'milestone' && (() => {
            const milestoneText = item.content?.title || item.content?.description || null;
            if (!milestoneText) return null;
            return (
              <View style={s.milestoneBanner}>
                <Ionicons name="star" size={18} color="#C9A84C" />
                <Text style={s.milestoneText}>{milestoneText}</Text>
              </View>
            );
          })()}

          {item.type === 'leaderboard' && (
            <View style={s.leaderBanner}>
              <Ionicons name="trending-up" size={14} color="#C9A84C" />
              <Text style={s.leaderText}>{item.content?.description ?? 'Moved on the leaderboard'}</Text>
            </View>
          )}

          {item.type === 'course_review' && item.content?.snippet && (
            <View style={s.reviewBanner}>
              <Text style={s.reviewStars}>{'★'.repeat(Math.round(item.content.rating ?? 0))}</Text>
              <Text style={s.reviewSnippet} numberOfLines={2}>{item.content.snippet}</Text>
            </View>
          )}

          {isCourseLeader && (
            <View style={s.courseLeaderBanner}>
              <Text style={s.courseLeaderEmoji}>🏆</Text>
              <View style={{ flex: 1 }}>
                <Text style={s.courseLeaderText}>{item.content?.description ?? `${handle} is the fastest here`}</Text>
                {item.content?.pop_score != null && (
                  <Text style={s.courseLeaderScore}>{item.content.pop_score.toFixed(1)} CLK</Text>
                )}
              </View>
            </View>
          )}

          {isChallengeWon && (
            <View style={s.challengeWonBanner}>
              <Text style={s.challengeWonEmoji}>⚡</Text>
              <Text style={s.challengeWonText}>{item.content?.description ?? 'Won a challenge'}</Text>
            </View>
          )}

          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 10 }}>
            <ActionBar
              item={item}
              liked={liked}
              commentCount={cCount}
              onLike={() => onLike(item, liked)}
              onComment={() => onComment(item)}
            />
            {item.type === 'round_logged' && (
              <ChallengeButton
                targetUserId={item.user_id}
                targetUsername={item.username ?? item.full_name?.split(' ')[0] ?? 'player'}
                courseName={item.content?.course_name}
                challengerScore={myBestScore}
                variant="inline"
              />
            )}
          </View>
        </View>
      </View>
    </View>
  );
}

// ─── Comment Sheet ────────────────────────────────────────────────────────────
function CommentSheet({ visible, activity, userId, onClose, onPosted }) {
  const [comments,  setComments]  = useState([]);
  const [loading,   setLoading]   = useState(false);
  const [draft,     setDraft]     = useState('');
  const [posting,   setPosting]   = useState(false);

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
      if (!data || data.length === 0) { setComments([]); return; }
      const uids = [...new Set(data.map(c => c.user_id))];
      const { data: profs } = await supabase
        .from('profiles').select('id, username, full_name').in('id', uids);
      const pm = {};
      (profs ?? []).forEach(p => { pm[p.id] = p; });
      setComments(data.map(c => ({ ...c, username: pm[c.user_id]?.username, full_name: pm[c.user_id]?.full_name })));
    } catch (e) {
      // silent fail
    } finally {
      setLoading(false);
    }
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
      if (activity.user_id !== userId) {
        const { data: me } = await supabase.from('profiles').select('username, full_name').eq('id', userId).maybeSingle();
        const name = me?.username ? `@${me.username}` : (me?.full_name?.split(' ')[0] ?? 'Someone');
        await sendPushToUser(activity.user_id, `${name} commented`, `"${body.slice(0, 60)}${body.length > 60 ? '…' : ''}"`, 'comment');
      }
    } catch (e) {
      // silent fail
    } finally {
      setPosting(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView style={{ flex: 1, backgroundColor: '#090F0A' }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16, borderBottomWidth: 1, borderBottomColor: '#7DC87A22' }}>
          <Text style={{ fontSize: 16, fontWeight: '600', color: '#F5EDD8' }}>Comments</Text>
          <TouchableOpacity onPress={onClose} activeOpacity={0.7}>
            <Ionicons name="close" size={22} color="#B8A882" />
          </TouchableOpacity>
        </View>
        <FlatList
          data={comments}
          keyExtractor={c => c.id}
          contentContainerStyle={{ padding: 16, gap: 12, flexGrow: 1 }}
          ListEmptyComponent={
            loading
              ? <ActivityIndicator color="#C9A84C" style={{ marginTop: 40 }} />
              : <Text style={{ color: '#7A6E58', textAlign: 'center', marginTop: 40, fontSize: 16, fontFamily: 'serif' }}>No comments yet. Be first.</Text>
          }
          renderItem={({ item }) => {
            const name = item.username ? `@${item.username}` : (item.full_name?.split(' ')[0] ?? 'Golfer');
            return (
              <View style={{ flexDirection: 'row', gap: 10 }}>
                <InitialsAvatar name={item.full_name} size={32} />
                <View style={{ flex: 1, backgroundColor: '#0D1A0F', borderRadius: 12, padding: 10 }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
                    <Text style={{ fontSize: 12, fontWeight: '700', color: '#F5EDD8' }}>{name}</Text>
                    <Text style={{ fontSize: 10, color: '#7A6E58' }}>{timeAgo(item.created_at)}</Text>
                  </View>
                  <Text style={{ fontSize: 14, color: '#B8A882', lineHeight: 20 }}>{item.body}</Text>
                </View>
              </View>
            );
          }}
        />
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <View style={{ flexDirection: 'row', gap: 10, padding: 12, borderTopWidth: 1, borderTopColor: '#7DC87A22', alignItems: 'flex-end' }}>
            <TextInput
              style={{ flex: 1, backgroundColor: '#0D1A0F', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, color: '#F5EDD8', fontSize: 14, maxHeight: 100, borderWidth: 1, borderColor: '#7DC87A22' }}
              placeholder="Add a comment…"
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
              style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: draft.trim() ? '#C9A84C' : '#1A2E1C', alignItems: 'center', justifyContent: 'center' }}
            >
              {posting
                ? <ActivityIndicator size="small" color="#090F0A" />
                : <Ionicons name="arrow-up" size={18} color={draft.trim() ? '#090F0A' : '#7A6E58'} />}
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  );
}

// ─── Compose Modal ────────────────────────────────────────────────────────────
function ComposeModal({ visible, userId, onClose, onPosted }) {
  const [text,        setText]        = useState('');
  const [posting,     setPosting]     = useState(false);
  const [recentRound, setRecentRound] = useState(null);
  const [attachRound, setAttachRound] = useState(false);

  useEffect(() => {
    if (!visible || !userId) return;
    setText('');
    setAttachRound(false);
    supabase.from('rounds')
      .select('id, course_name, pop_score, holes, transport, players, duration_minutes')
      .eq('user_id', userId)
      .not('pop_score', 'is', null)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
      .then(({ data }) => setRecentRound(data ?? null));
  }, [visible, userId]);

  const submit = async () => {
    const body = text.trim();
    if (!body) return;
    setPosting(true);
    try {
      const content = {
        text: body,
        ...(attachRound && recentRound ? { attached_round: {
          course_name:      recentRound.course_name,
          pop_score:        recentRound.pop_score,
          duration_minutes: recentRound.duration_minutes,
          holes:            recentRound.holes,
          transport:        recentRound.transport,
          players:          recentRound.players,
        }} : {}),
      };
      await supabase.from('activity_feed').insert({ user_id: userId, type: 'user_post', content });
      onPosted?.();
      onClose();
    } catch (e) {
      Alert.alert('Error', 'Could not post. Please try again.');
    } finally {
      setPosting(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView style={{ flex: 1, backgroundColor: '#090F0A' }}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16, borderBottomWidth: 1, borderBottomColor: '#7DC87A22' }}>
            <TouchableOpacity onPress={onClose} activeOpacity={0.7}>
              <Text style={{ fontSize: 14, color: '#B8A882' }}>Cancel</Text>
            </TouchableOpacity>
            <Text style={{ fontSize: 12, fontWeight: '700', color: '#F5EDD8', letterSpacing: 1.5 }}>NEW POST</Text>
            <TouchableOpacity
              onPress={submit}
              disabled={!text.trim() || posting}
              activeOpacity={0.8}
              style={{ backgroundColor: text.trim() ? '#C9A84C' : '#1A2E1C', borderRadius: 16, paddingHorizontal: 16, paddingVertical: 8 }}
            >
              {posting
                ? <ActivityIndicator size="small" color="#090F0A" />
                : <Text style={{ fontSize: 12, fontWeight: '700', color: text.trim() ? '#090F0A' : '#7A6E58', letterSpacing: 1 }}>POST</Text>}
            </TouchableOpacity>
          </View>

          <TextInput
            style={{ flex: 1, padding: 18, fontSize: 16, color: '#F5EDD8', lineHeight: 24 }}
            placeholder="What's on your mind? Share a round, tip, or course take…"
            placeholderTextColor="#7A6E58"
            value={text}
            onChangeText={t => setText(t.slice(0, 280))}
            multiline
            autoFocus
          />

          <View style={{ borderTopWidth: 1, borderTopColor: '#7DC87A22', padding: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <Text style={{ fontSize: 12, color: text.length >= 240 ? (text.length >= 280 ? '#C07A6A' : '#D4B86A') : '#7A6E58' }}>
              {280 - text.length}
            </Text>
            {recentRound && (
              <TouchableOpacity
                onPress={() => setAttachRound(v => !v)}
                activeOpacity={0.8}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 6, paddingHorizontal: 12, borderRadius: 16, borderWidth: 1, borderColor: attachRound ? '#7DC87A' : '#7DC87A33', backgroundColor: attachRound ? 'rgba(125,200,122,0.1)' : 'transparent' }}
              >
                <Ionicons name="golf" size={14} color={attachRound ? '#7DC87A' : '#7A6E58'} />
                <Text style={{ fontSize: 12, fontWeight: '600', color: attachRound ? '#7DC87A' : '#7A6E58' }}>
                  {attachRound ? 'Round attached' : 'Attach last round'}
                </Text>
              </TouchableOpacity>
            )}
          </View>

          {attachRound && recentRound && (
            <View style={{ margin: 12, marginTop: 0, padding: 10, backgroundColor: '#0D1A0F', borderRadius: 12, borderWidth: 1, borderColor: '#7DC87A22' }}>
              <Text style={{ fontSize: 13, fontWeight: '600', color: '#F5EDD8', marginBottom: 2 }} numberOfLines={1}>{recentRound.course_name}</Text>
              <Text style={{ fontSize: 11, color: '#B8A882' }}>
                {[recentRound.holes && `${recentRound.holes}h`, recentRound.transport, formatTime(recentRound.duration_minutes)].filter(Boolean).join(' · ')}
              </Text>
            </View>
          )}
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────
export default function ActivityFeedScreen({ navigation }) {
  const { user } = useAuth();
  const uid = user?.id;

  const [tab,           setTab]           = useState('following');
  const [items,         setItems]         = useState([]);
  const [loading,       setLoading]       = useState(true);
  const [refreshing,    setRefreshing]    = useState(false);
  const [loadingMore,   setLoadingMore]   = useState(false);
  const [hasMore,       setHasMore]       = useState(false);
  const [error,         setError]         = useState(false);
  const [likedIds,      setLikedIds]      = useState(new Set());
  const [commentCounts, setCommentCounts] = useState({});
  const [commentSheet,  setCommentSheet]  = useState(null);
  const [composeOpen,   setComposeOpen]   = useState(false);
  const [myScoreMap,    setMyScoreMap]    = useState({});

  const offsetRef      = useRef(0);
  const followingRef   = useRef([]);
  const activeTabRef   = useRef('following');

  useEffect(() => {
    if (!uid) return;
    supabase.from('rounds').select('course_name, pop_score')
      .eq('user_id', uid).not('pop_score', 'is', null)
      .order('pop_score', { ascending: false }).limit(100)
      .then(({ data }) => {
        const map = {};
        for (const r of data ?? []) {
          if (r.course_name && map[r.course_name] == null) map[r.course_name] = r.pop_score;
        }
        setMyScoreMap(map);
      });
  }, [uid]);

  const fetchFollowingIds = async () => {
    if (!uid) return [];
    const { data } = await supabase.from('follows').select('following_id').eq('follower_id', uid);
    const ids = (data ?? []).map(f => f.following_id);
    followingRef.current = ids;
    return ids;
  };

  const fetchPage = async ({ reset, currentTab }) => {
    if (!uid) return;
    const offset = reset ? 0 : offsetRef.current;

    let query = supabase
      .from('activity_feed')
      .select('id, user_id, type, content, round_id, likes, created_at')
      .order('created_at', { ascending: false })
      .range(offset, offset + PAGE_SIZE - 1);

    if (currentTab === 'following') {
      const fids = reset ? await fetchFollowingIds() : followingRef.current;
      if (fids.length === 0) return [];
      query = query.in('user_id', fids);
    }

    const { data, error: err } = await query;
    if (err) throw err;
    const rows = data ?? [];

    // Enrich with profile data
    if (rows.length > 0) {
      const uids = [...new Set(rows.map(r => r.user_id))];
      const { data: profs } = await supabase.from('profiles').select('id, username, full_name').in('id', uids);
      const pm = {};
      (profs ?? []).forEach(p => { pm[p.id] = p; });
      rows.forEach(r => {
        r.username  = pm[r.user_id]?.username  ?? null;
        r.full_name = pm[r.user_id]?.full_name ?? null;
      });

      // User's likes
      const ids = rows.map(r => r.id);
      const { data: likesData } = await supabase
        .from('activity_likes').select('activity_id').eq('user_id', uid).in('activity_id', ids);
      const newLikes = new Set((likesData ?? []).map(l => l.activity_id));
      setLikedIds(prev => reset ? newLikes : new Set([...prev, ...newLikes]));

      // Comment counts
      const { data: cData } = await supabase
        .from('activity_comments').select('activity_id').in('activity_id', ids);
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
    setError(false);
    offsetRef.current = 0;
    try {
      const rows = await fetchPage({ reset: true, currentTab });
      setItems(rows ?? []);
    } catch (e) {
      setError(true);
    } finally {
      setLoading(false);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    offsetRef.current = 0;
    try {
      const rows = await fetchPage({ reset: true, currentTab: activeTabRef.current });
      setItems(rows ?? []);
    } catch (e) {
      // silent fail
    } finally {
      setRefreshing(false);
    }
  };

  const onEndReached = async () => {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);
    try {
      const rows = await fetchPage({ reset: false, currentTab: activeTabRef.current });
      setItems(prev => [...prev, ...(rows ?? [])]);
    } catch (e) {
      // silent fail
    } finally {
      setLoadingMore(false);
    }
  };

  const switchTab = (newTab) => {
    if (newTab === activeTabRef.current) return;
    activeTabRef.current = newTab;
    setTab(newTab);
    setItems([]);
    setLikedIds(new Set());
    setCommentCounts({});
    loadFeed(newTab);
  };

  const handleLike = async (item, isLiked) => {
    if (!uid) return;
    const id = item.id;
    // Optimistic
    setItems(prev => prev.map(i => i.id === id ? { ...i, likes: isLiked ? Math.max(0, i.likes - 1) : i.likes + 1 } : i));
    setLikedIds(prev => { const s = new Set(prev); isLiked ? s.delete(id) : s.add(id); return s; });
    try {
      if (isLiked) {
        await supabase.from('activity_likes').delete().eq('activity_id', id).eq('user_id', uid);
        await supabase.from('activity_feed').update({ likes: Math.max(0, item.likes - 1) }).eq('id', id);
      } else {
        await supabase.from('activity_likes').insert({ activity_id: id, user_id: uid });
        await supabase.from('activity_feed').update({ likes: item.likes + 1 }).eq('id', id);
        if (item.user_id !== uid) {
          const { data: me } = await supabase.from('profiles').select('username, full_name').eq('id', uid).maybeSingle();
          const name = me?.username ? `@${me.username}` : (me?.full_name?.split(' ')[0] ?? 'Someone');
          const where = item.content?.course_name ? `at ${item.content.course_name}` : '';
          await sendPushToUser(item.user_id, `${name} liked your round`, where, 'like', { activity_id: item.id });
        }
      }
    } catch (e) {
      // Revert
      setItems(prev => prev.map(i => i.id === id ? { ...i, likes: item.likes } : i));
      setLikedIds(prev => { const s = new Set(prev); isLiked ? s.add(id) : s.delete(id); return s; });
    }
  };

  const onCommentPosted = (activityId) => {
    setCommentCounts(prev => ({ ...prev, [activityId]: (prev[activityId] ?? 0) + 1 }));
  };

  useFocusEffect(useCallback(() => {
    (async () => {
      let defaultTab = 'global';
      if (uid) {
        const { count } = await supabase
          .from('follows')
          .select('*', { count: 'exact', head: true })
          .eq('follower_id', uid);
        if ((count ?? 0) > 0) defaultTab = 'following';
      }
      activeTabRef.current = defaultTab;
      setTab(defaultTab);
      loadFeed(defaultTab);
    })();
  }, []));

  return (
    <SafeAreaView style={s.container}>
      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={s.backBtn} activeOpacity={0.7} accessibilityLabel="Go back" accessibilityRole="button">
          <Text style={s.backArrow}>←</Text>
        </TouchableOpacity>
        <Text style={s.title}>ACTIVITY</Text>
        <View style={{ width: 40 }} />
      </View>

      {/* Tabs */}
      <View style={s.tabRow}>
        {[['following', 'FOLLOWING'], ['global', 'GLOBAL']].map(([key, label]) => (
          <TouchableOpacity key={key} style={[s.tab, tab === key && s.tabActive]} onPress={() => switchTab(key)} activeOpacity={0.7}>
            <Text style={[s.tabText, tab === key && s.tabTextActive]}>{label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {loading ? (
        <View style={{ flex: 1 }}>
          {[1,2,3,4].map(i => <SkeletonCard key={i} />)}
        </View>
      ) : error ? (
        <View style={s.centerState}>
          <Ionicons name="cloud-offline-outline" size={40} color="rgba(201,168,76,0.3)" style={{ marginBottom: 14 }} />
          <Text style={s.emptyText}>Could not load activity. Check your connection.</Text>
          <TouchableOpacity style={s.btn} onPress={() => loadFeed(activeTabRef.current)} activeOpacity={0.8}>
            <Text style={s.btnText}>RETRY</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={item => item.id}
          renderItem={({ item }) => (
            <FeedItem
              item={item}
              userId={uid}
              navigation={navigation}
              likedIds={likedIds}
              commentCounts={commentCounts}
              onLike={handleLike}
              onComment={setCommentSheet}
              myBestScore={myScoreMap[item.content?.course_name] ?? null}
            />
          )}
          ItemSeparatorComponent={() => <View style={s.divider} />}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#C9A84C" />}
          onEndReached={onEndReached}
          onEndReachedThreshold={0.3}
          ListEmptyComponent={
            tab === 'following' ? (
              <View style={s.centerState}>
                <Ionicons name="flag-outline" size={52} color="rgba(201,168,76,0.25)" style={{ marginBottom: 16 }} />
                <Text style={s.emptyTitle}>Nothing here yet</Text>
                <Text style={s.emptyText}>Follow fast golfers to see their rounds, challenges, and milestones right here.</Text>
                <TouchableOpacity style={s.btn} onPress={() => navigation.navigate('SearchUsers')} activeOpacity={0.8}>
                  <Text style={s.btnText}>FIND GOLFERS →</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => switchTab('global')} activeOpacity={0.7} style={{ marginTop: 14 }}>
                  <Text style={{ fontSize: 12, color: '#7A6E58', textDecorationLine: 'underline' }}>Browse global feed instead</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <View style={s.centerState}>
                <Ionicons name="golf-outline" size={48} color="rgba(201,168,76,0.3)" style={{ marginBottom: 14 }} />
                <Text style={s.emptyText}>No activity yet. Log a round to get started!</Text>
              </View>
            )
          }
          ListFooterComponent={loadingMore ? <ActivityIndicator color="#C9A84C" style={{ paddingVertical: 20 }} /> : null}
          contentContainerStyle={{ paddingBottom: 100, flexGrow: 1 }}
        />
      )}

      {/* Compose FAB */}
      <TouchableOpacity style={s.fab} onPress={() => setComposeOpen(true)} activeOpacity={0.85}>
        <Ionicons name="create-outline" size={22} color="#090F0A" />
      </TouchableOpacity>

      <CommentSheet
        visible={!!commentSheet}
        activity={commentSheet}
        userId={uid}
        onClose={() => setCommentSheet(null)}
        onPosted={onCommentPosted}
      />
      <ComposeModal
        visible={composeOpen}
        userId={uid}
        onClose={() => setComposeOpen(false)}
        onPosted={() => loadFeed(activeTabRef.current)}
      />
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  container:      { flex: 1, backgroundColor: '#090F0A' },
  // Header
  header:         { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 12, paddingBottom: 10, borderBottomWidth: 1, borderBottomColor: '#7DC87A22' },
  backBtn:        { width: 40, height: 40, justifyContent: 'center' },
  backArrow:      { fontSize: 22, color: '#C9A84C' },
  title:          { fontSize: 13, fontWeight: '700', color: '#F5EDD8', letterSpacing: 3 },
  // Tabs
  tabRow:         { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: '#7DC87A22' },
  tab:            { flex: 1, paddingVertical: 12, alignItems: 'center' },
  tabActive:      { borderBottomWidth: 2, borderBottomColor: '#C9A84C' },
  tabText:        { fontSize: 11, fontWeight: '700', color: '#7A6E58', letterSpacing: 2 },
  tabTextActive:  { color: '#C9A84C' },
  // Feed card
  feedCard:            { paddingHorizontal: 16, paddingVertical: 18 },
  feedCardLive:        { borderLeftWidth: 3, borderLeftColor: '#7DC87A', paddingLeft: 13, backgroundColor: 'rgba(125,200,122,0.03)' },
  feedCardCourseLeader:{ borderLeftWidth: 3, borderLeftColor: '#C9A84C', paddingLeft: 13, backgroundColor: 'rgba(201,168,76,0.03)' },
  feedCardChallengeWon:{ borderLeftWidth: 3, borderLeftColor: '#C9A84C88', paddingLeft: 13 },
  avatarLiveDot:       { position: 'absolute', bottom: 0, right: 0, width: 10, height: 10, borderRadius: 5, backgroundColor: '#7DC87A', borderWidth: 1.5, borderColor: '#131A14' },
  // Live NOW badge
  liveNowBadge:  { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#7DC87A22', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  liveNowDot:    { width: 6, height: 6, borderRadius: 3, backgroundColor: '#7DC87A' },
  liveNowText:   { fontSize: 9, fontWeight: '800', color: '#7DC87A', letterSpacing: 1 },
  // Live banner
  liveBanner:    { flexDirection: 'row', alignItems: 'flex-start', gap: 6, backgroundColor: '#7DC87A0D', borderRadius: 10, padding: 10, marginTop: 8, borderWidth: 1, borderColor: '#7DC87A22' },
  liveDot:       { width: 8, height: 8, borderRadius: 4, backgroundColor: '#7DC87A', marginTop: 4 },
  liveLabel:     { fontSize: 13, color: '#F5EDD8', fontWeight: '600', lineHeight: 18 },
  liveMeta:      { fontSize: 11, color: '#7DC87A', marginTop: 3 },
  handle:        { fontSize: 14, fontWeight: '800', color: '#F5EDD8' },
  timestamp:     { fontSize: 10, color: 'rgba(184,168,130,0.6)' },
  actionLabel:   { fontSize: 13, color: '#B8A882', marginTop: 2, marginBottom: 8 },
  postText:      { fontSize: 15, color: '#F5EDD8', lineHeight: 22, marginTop: 6, marginBottom: 8 },
  divider:       { height: 1, backgroundColor: '#7DC87A12', marginLeft: 66 },
  // Round card inside feed
  roundCard:     { marginTop: 8, backgroundColor: '#0D1A0F', borderRadius: 12, padding: 12, borderWidth: 1, borderColor: '#7DC87A18' },
  roundCourse:   { fontSize: 14, fontWeight: '600', color: '#F5EDD8', marginBottom: 3 },
  roundDetails:  { fontSize: 11, color: '#B8A882' },
  popBadge:      { borderWidth: 1.5, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 6, alignItems: 'center', minWidth: 52 },
  popScore:      { fontSize: 20, fontWeight: '800' },
  popLabel:      { fontSize: 7, fontWeight: '700', letterSpacing: 1.5, marginTop: -2 },
  verifiedBadge: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  verifiedText:  { fontSize: 9, fontWeight: '700', color: '#7DC87A', letterSpacing: 1 },
  bestBadge:     { flexDirection: 'row', alignItems: 'center', gap: 4 },
  bestText:      { fontSize: 9, fontWeight: '700', color: '#C9A84C', letterSpacing: 1 },
  // Actions
  actionBar:     { flexDirection: 'row', gap: 20 },
  actionBtn:     { flexDirection: 'row', alignItems: 'center', gap: 5, minWidth: 44, minHeight: 44, justifyContent: 'center' },
  actionCount:   { fontSize: 13, color: '#7A6E58' },
  // Milestone / leaderboard / review / course leader / challenge won
  milestoneBanner:     { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#0D1A0F', borderRadius: 10, padding: 10, marginTop: 8, borderWidth: 1, borderColor: '#C9A84C33' },
  milestoneEmoji:      { fontSize: 20 },
  milestoneText:       { flex: 1, fontSize: 14, color: '#F5EDD8', lineHeight: 20 },
  leaderBanner:        { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#0D1A0F', borderRadius: 10, padding: 10, marginTop: 8, borderWidth: 1, borderColor: '#C9A84C33' },
  leaderText:          { flex: 1, fontSize: 14, color: '#F5EDD8', lineHeight: 20 },
  reviewBanner:        { backgroundColor: '#0D1A0F', borderRadius: 10, padding: 10, marginTop: 8, borderWidth: 1, borderColor: '#7DC87A22' },
  reviewStars:         { fontSize: 14, color: '#C9A84C', marginBottom: 4 },
  reviewSnippet:       { fontSize: 13, color: '#B8A882', lineHeight: 19, fontStyle: 'italic' },
  courseLeaderBanner:  { flexDirection: 'row', alignItems: 'flex-start', gap: 10, backgroundColor: '#C9A84C0D', borderRadius: 10, padding: 12, marginTop: 8, borderWidth: 1, borderColor: '#C9A84C44' },
  courseLeaderEmoji:   { fontSize: 22 },
  courseLeaderText:    { fontSize: 14, fontWeight: '600', color: '#F5EDD8', lineHeight: 20 },
  courseLeaderScore:   { fontSize: 12, fontWeight: '700', color: '#C9A84C', marginTop: 2 },
  challengeWonBanner:  { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#C9A84C0D', borderRadius: 10, padding: 10, marginTop: 8, borderWidth: 1, borderColor: '#C9A84C55' },
  challengeWonEmoji:   { fontSize: 20 },
  challengeWonText:    { flex: 1, fontSize: 14, color: '#F5EDD8', lineHeight: 20 },
  // States
  centerState:   { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32, paddingVertical: 60 },
  emptyTitle:    { fontSize: 18, fontWeight: '700', color: '#B8A882', textAlign: 'center', marginBottom: 10 },
  emptyText:     { fontSize: 14, color: '#7A6E58', textAlign: 'center', lineHeight: 22, marginBottom: 24 },
  btn:           { backgroundColor: '#C9A84C', borderRadius: 12, paddingVertical: 12, paddingHorizontal: 28 },
  btnText:       { fontSize: 11, fontWeight: '700', color: '#090F0A', letterSpacing: 2 },
  // FAB
  fab:            { position: 'absolute', bottom: 24, right: 20, width: 52, height: 52, borderRadius: 26, backgroundColor: '#C9A84C', alignItems: 'center', justifyContent: 'center', shadowColor: '#C9A84C', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.4, shadowRadius: 12, elevation: 8 },
});
