import { useState, useEffect } from 'react';
import {
  View, Text, ScrollView, FlatList, TouchableOpacity, StyleSheet, ActivityIndicator, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../lib/supabase';
import { PROFILE_COLUMNS } from '../lib/profileColumns';
import { useAuth } from '../context/AuthContext';
import { sendLocalNotification, sendPushToUser } from '../lib/notifications';
import ChallengeButton from '../components/ChallengeButton';
import Gauge from '../components/guage';
import CourseAvatar from '../components/CourseAvatar';
import InitialsAvatar from '../components/InitialsAvatar';
import ClockedScoreCard from '../components/ClockedScoreCard';
import RecentRoundsList from '../components/RecentRoundsList';
import { fetchClockedRatingForUser } from '../lib/clockedRating';
import { totalPointsFromHoleScores } from '../lib/clockedSport';
import { COLOR, RADIUS } from '../lib/theme';

// ─── Helpers ──────────────────────────────────────────────────────────────────

// Aggregate 0–100 Clocked Score color — matches LeaderboardScreen's clockedColor().
function clockedColor(score) {
  if (score == null) return COLOR.dim;
  if (score >= 70) return COLOR.green;
  if (score >= 40) return COLOR.gold;
  return COLOR.muted;
}

// Per-round points color (raw PTS, not the 0–100 aggregate score).
function ptsColor(pts) {
  if (pts == null) return COLOR.muted;
  if (pts >= 8) return COLOR.green;
  if (pts >= 0) return COLOR.gold;
  return '#C07A6A';
}

function formatDuration(minutes) {
  if (!minutes) return '—';
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h}h ${String(m).padStart(2, '0')}m`;
}

function formatShortDate(isoStr) {
  if (!isoStr) return '—';
  const d = new Date(isoStr);
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${months[d.getMonth()]} ${d.getDate()}`;
}

function timeAgo(isoStr) {
  if (!isoStr) return '';
  const diff = Math.floor((Date.now() - new Date(isoStr).getTime()) / 1000);
  if (diff < 60)     return 'Just now';
  if (diff < 3600)   return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400)  return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
  const d = new Date(isoStr);
  const mo = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${mo[d.getMonth()]} ${d.getDate()}`;
}

function PubActRow({ item }) {
  const typeMap = {
    round_logged:       { icon: 'golf',        color: COLOR.green, label: c => `Logged a round at ${c?.course_name ?? '—'}` },
    live_round_started: { icon: 'golf',        color: COLOR.green, label: c => `Playing live at ${c?.course_name ?? 'a course'} right now` },
    milestone:          { icon: 'trophy',      color: COLOR.gold, label: c => c?.title ?? 'Reached a milestone' },
    leaderboard:        { icon: 'trending-up', color: COLOR.gold, label: c => c?.description ?? 'Moved on the leaderboard' },
    course_review:      { icon: 'location',    color: COLOR.green, label: c => `Reviewed ${c?.course_name ?? 'a course'}` },
    user_post:          { icon: 'chatbubble',  color: COLOR.muted, label: c => c?.text?.slice(0, 80) ?? 'Shared an update' },
    course_leader:      { icon: 'trophy',      color: COLOR.gold, label: c => c?.description ?? 'Set a course record' },
  };
  const info    = typeMap[item.type] ?? { icon: 'ellipsis-horizontal', color: COLOR.dim, label: () => 'Activity' };
  const content = item.content ?? {};
  const pts     = content.team_score; // raw round points, set at save time (not the 0–100 aggregate)
  return (
    <View style={s.actRow}>
      <View style={[s.actIconWrap, { backgroundColor: info.color + '22' }]}>
        <Ionicons name={info.icon} size={16} color={info.color} />
      </View>
      <View style={s.actContent}>
        <Text style={s.actLabel}>{info.label(content)}</Text>
        {item.type === 'round_logged' && pts != null && (
          <Text style={[s.actPop, { color: ptsColor(pts) }]}>{pts > 0 ? `+${pts}` : pts} PTS</Text>
        )}
        <Text style={s.actTime}>{timeAgo(item.created_at)}</Text>
      </View>
    </View>
  );
}

function getInitials(fullName) {
  if (!fullName) return '?';
  const parts = fullName.trim().split(/\s+/);
  if (parts.length === 1) return parts[0][0].toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function PublicProfileScreen({ navigation, route }) {
  const { userId } = route.params;
  const { user, profile: myProfile } = useAuth();
  const myUid = user?.id;

  const [profile, setProfile]           = useState(null);
  const [rounds, setRounds]             = useState([]);
  const [loading, setLoading]           = useState(true);
  const [following, setFollowing]       = useState(false);
  const [followLoading, setFollowLoading] = useState(false);
  const [pubTab, setPubTab]             = useState('profile');
  const [activityItems, setActivityItems]   = useState([]);
  const [activityLoading, setActivityLoading] = useState(false);
  const [challengerBestScore, setChallengerBestScore] = useState(null);
  const [clockedRating, setClockedRating] = useState({ clockedScore: null, scoring: null, clock: null, isProvisional: true, roundsUsed: 0, roundsNeeded: 5 });
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setLoadError(false);

      try {
        const [{ data: profileData }, { data: roundsData }, { data: followData }] = await Promise.all([
          supabase.from('profiles').select(PROFILE_COLUMNS).eq('id', userId).maybeSingle(),
          supabase.from('rounds')
            .select('id, course_name, created_at, holes, duration_minutes, round_format, active_game, hole_scores')
            .eq('user_id', userId)
            .order('created_at', { ascending: false })
            .limit(20),
          myUid
            ? supabase.from('follows').select('id').eq('follower_id', myUid).eq('following_id', userId).maybeSingle()
            : Promise.resolve({ data: null }),
        ]);

        setProfile(profileData);
        setRounds(roundsData ?? []);
        setFollowing(!!followData);

        // Real Clocked Score (0–100) — canonical computation shared with
        // HomeScreen/LeaderboardScreen/ProfileScreen so every screen agrees.
        // Covers rounds this user logged themselves plus confirmed
        // participations, not just what's in `roundsData` (their own logs).
        const rating = await fetchClockedRatingForUser(supabase, userId, profileData);
        setClockedRating(rating);

        // Fetch challenger's (viewer's) best round POINTS at this user's most
        // recent course — points, not the 0–100 aggregate score, since this
        // is a single-round comparison (ChallengeButton shows it as a target
        // to beat, not the aggregate rating).
        if (myUid && roundsData?.length > 0) {
          const defaultCourse = roundsData[0].course_name;
          if (defaultCourse) {
            supabase.from('rounds').select('hole_scores')
              .eq('user_id', myUid).eq('course_name', defaultCourse)
              .eq('round_format', 'clocked').not('hole_scores', 'is', null)
              .then(({ data }) => {
                const totals = (data ?? [])
                  .map(r => totalPointsFromHoleScores(r.hole_scores))
                  .filter(v => v != null);
                setChallengerBestScore(totals.length ? Math.max(...totals) : null);
              });
          }
        }

        // Load activity feed (non-blocking)
        setActivityLoading(true);
        supabase.from('activity_feed')
          .select('id, type, content, created_at')
          .eq('user_id', userId)
          .order('created_at', { ascending: false })
          .limit(30)
          .then(({ data }) => { setActivityItems(data ?? []); setActivityLoading(false); });
      } catch (e) {
        setLoadError(true);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [userId, myUid]);

  const toggleFollow = async () => {
    if (!myUid || followLoading) return;
    setFollowLoading(true);
    const wasFollowing = following;
    setFollowing(!wasFollowing); // optimistic update

    if (wasFollowing) {
      const { error } = await supabase.from('follows').delete()
        .eq('follower_id', myUid).eq('following_id', userId);
      if (error) setFollowing(true); // revert
    } else {
      const { error } = await supabase.from('follows').insert({
        follower_id:  myUid,
        following_id: userId,
      });
      if (error) { setFollowing(false); } // revert
      else {
        // Notify the followed user
        const senderName = myProfile?.username ? `@${myProfile.username}` : 'Someone';
        await sendPushToUser(userId, 'New Follower', `${senderName} is now following you on Clocked.`, 'new_follower', { follower_id: myUid });
      }
    }
    setFollowLoading(false);
  };

  if (loading) {
    return (
      <SafeAreaView style={s.container}>
        <TouchableOpacity style={s.backBtn} onPress={() => navigation.goBack()} activeOpacity={0.7}>
          <Ionicons name="chevron-back" size={20} color={COLOR.gold} />
        </TouchableOpacity>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator size="large" color={COLOR.gold} />
        </View>
      </SafeAreaView>
    );
  }

  if (loadError) {
    return (
      <SafeAreaView style={s.container}>
        <TouchableOpacity style={s.backBtn} onPress={() => navigation.goBack()} activeOpacity={0.7}>
          <Ionicons name="chevron-back" size={20} color={COLOR.gold} />
        </TouchableOpacity>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ color: COLOR.dim, fontSize: 16 }}>Couldn't load this profile. Check your connection and try again.</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!profile) {
    return (
      <SafeAreaView style={s.container}>
        <TouchableOpacity style={s.backBtn} onPress={() => navigation.goBack()} activeOpacity={0.7}>
          <Ionicons name="chevron-back" size={20} color={COLOR.gold} />
        </TouchableOpacity>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ color: COLOR.dim, fontSize: 16 }}>Profile not found.</Text>
        </View>
      </SafeAreaView>
    );
  }

  const initials = getInitials(profile.full_name);

  // Stat card values from rounds — best round is raw points (a single
  // round's total), the aggregate Clocked Score (0–100) lives in
  // clockedRating.clockedScore / the ClockedScoreCard above.
  const clockedRoundsWithScores = rounds.filter(r => r.round_format === 'clocked' && r.hole_scores?.length);
  const bestRoundPts = clockedRoundsWithScores.length
    ? Math.max(...clockedRoundsWithScores.map(r => totalPointsFromHoleScores(r.hole_scores)))
    : null;
  const avgTime  = rounds.length > 0 ? Math.round(rounds.reduce((s, r) => s + (r.duration_minutes || 0), 0) / rounds.length) : null;

  // Pace streak — consecutive most-recent clocked rounds with non-negative points.
  let paceStreak = 0;
  for (const r of clockedRoundsWithScores) {
    const pts = totalPointsFromHoleScores(r.hole_scores);
    if (pts != null && pts >= 0) paceStreak++; else break;
  }

  const isOwnProfile = myUid === userId;

  return (
    <SafeAreaView style={s.container}>
      {/* Top bar */}
      <View style={s.topBar}>
        <TouchableOpacity style={s.backBtn} onPress={() => navigation.goBack()} activeOpacity={0.7} accessibilityLabel="Back" hitSlop={8}>
          <Ionicons name="chevron-back" size={22} color={COLOR.gold} />
          <Text style={s.backText}>{profile?.username ? `@${profile.username}` : 'PLAYER'}</Text>
        </TouchableOpacity>

        {!isOwnProfile && (
          <TouchableOpacity
            style={[s.followBtn, following && s.followingBtn]}
            onPress={toggleFollow}
            activeOpacity={0.7}
            disabled={followLoading}
          >
            {following
              ? <Ionicons name="checkmark" size={13} color={COLOR.green} style={{ marginRight: 4 }} />
              : null}
            <Text style={[s.followBtnText, following && s.followingBtnText]}>
              {following ? 'FOLLOWING' : 'FOLLOW'}
            </Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Challenge + Rivalry — visitors only, golfers only */}
      {!isOwnProfile && myUid && rounds.length > 0 && (
        <View style={{ flexDirection: 'row', gap: 10, paddingHorizontal: 16, paddingBottom: 10, justifyContent: 'flex-end' }}>
          <TouchableOpacity
            style={s.vsBtn}
            onPress={() => navigation.navigate('Rivalry', { userId, username: profile.username ?? profile.full_name })}
            activeOpacity={0.8}
            accessibilityLabel={`Head to head vs ${profile.username ?? 'this player'}`}
          >
            <Ionicons name="stats-chart" size={11} color={COLOR.muted} />
            <Text style={s.vsBtnText}>VS</Text>
          </TouchableOpacity>
          <ChallengeButton
            targetUserId={userId}
            targetUsername={profile.username ?? profile.full_name?.split(' ')[0] ?? 'player'}
            courseName={rounds[0]?.course_name}
            challengerScore={challengerBestScore}
          />
        </View>
      )}

      {/* Profile / Activity tabs */}
      <View style={s.pubTabBar}>
        {['PROFILE', 'ACTIVITY'].map(t => (
          <TouchableOpacity
            key={t}
            style={[s.pubTabBtn, pubTab === t.toLowerCase() && s.pubTabBtnActive]}
            onPress={() => setPubTab(t.toLowerCase())}
            activeOpacity={0.8}
          >
            <Text style={[s.pubTabText, pubTab === t.toLowerCase() && s.pubTabTextActive]}>{t}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {pubTab === 'profile' && (
      <ScrollView contentContainerStyle={s.scroll}>
        {/* Avatar + identity */}
        <View style={s.identityRow}>
          <InitialsAvatar name={profile.full_name} size={60} avatarUrl={profile.avatar_url} />
          <View style={s.identityInfo}>
            <Text style={s.fullName}>{profile.full_name || '—'}</Text>
            <Text style={s.username}>@{profile.username || '—'}</Text>
            {profile.home_course ? (
              <Text style={s.homeCourse}>{profile.home_course}</Text>
            ) : null}
          </View>
        </View>

        {/* Clocked Score card */}
        {(
          <ClockedScoreCard
            clockedScore={clockedRating.clockedScore}
            scoring={clockedRating.scoring}
            clock={clockedRating.clock}
            isProvisional={clockedRating.isProvisional}
            roundsUsed={clockedRating.roundsUsed}
            roundsNeeded={clockedRating.roundsNeeded}
          />
        )}

        {/* Clocked Score credential row */}
        {clockedRating.clockedScore != null && (clockedRating.roundsUsed ?? 0) > 0 && (
          <View style={s.credentialRow}>
            <View style={s.credentialCard}>
              <Text style={s.credentialLabel}>CLOCKED SCORE</Text>
              <Text style={[s.credentialValue, { color: clockedColor(clockedRating.clockedScore) }]}>{clockedRating.clockedScore}</Text>
            </View>
          </View>
        )}

        {/* Stat cards */}
        <View style={s.statRow}>
          <View style={s.statCard}>
            <Text style={s.statLabel}>ROUNDS{'\n'}LOGGED</Text>
            <Text style={s.statValue}>{rounds.length > 0 ? profile.total_rounds ?? rounds.length : 0}</Text>
          </View>
          <View style={s.statCard}>
            <Text style={s.statLabel}>BEST{'\n'}ROUND</Text>
            <Text style={[s.statValue, bestRoundPts != null && { color: ptsColor(bestRoundPts) }]}>
              {bestRoundPts != null ? `${bestRoundPts > 0 ? '+' : ''}${bestRoundPts} PTS` : '—'}
            </Text>
          </View>
          <View style={s.statCard}>
            <Text style={s.statLabel}>AVG ROUND{'\n'}TIME</Text>
            <Text style={s.statValue}>{formatDuration(avgTime)}</Text>
          </View>
          <View style={s.statCard}>
            <Text style={s.statLabel}>PACE{'\n'}STREAK</Text>
            <Text style={s.statValue}>{paceStreak > 0 ? `${paceStreak}${paceStreak >= 3 ? ' 🔥' : ''}` : '—'}</Text>
          </View>
        </View>

        {/* Recent rounds — format-aware */}
        <RecentRoundsList rounds={rounds} navigation={navigation} limit={10} />

        {rounds.length === 0 && (
          <View style={s.emptyRounds}>
            <Ionicons name="golf-outline" size={36} color="rgba(201,168,76,0.25)" style={{ marginBottom: 10 }} />
            <Text style={s.emptyRoundsText}>No rounds logged yet.</Text>
          </View>
        )}

      </ScrollView>
      )}

      {pubTab === 'activity' && (
        activityLoading
          ? <ActivityIndicator color={COLOR.gold} style={{ marginTop: 60 }} />
          : activityItems.length === 0
            ? <View style={s.actEmpty}>
                <Ionicons name="time-outline" size={36} color="rgba(201,168,76,0.2)" />
                <Text style={s.actEmptyText}>No activity yet.</Text>
              </View>
            : <FlatList
                data={activityItems}
                keyExtractor={i => i.id}
                renderItem={({ item }) => <PubActRow item={item} />}
                contentContainerStyle={{ paddingBottom: 40 }}
              />
      )}
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container:      { flex: 1, backgroundColor: COLOR.bg },
  vsBtn:          { flexDirection: 'row', alignItems: 'center', gap: 4, borderWidth: 1, borderColor: '#7DC87A22', borderRadius: RADIUS.sm, paddingVertical: 9, paddingHorizontal: 16 },
  vsBtnText:      { fontSize: 11, fontWeight: '700', color: COLOR.muted, letterSpacing: 2 },
  topBar:         { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 10 },
  backBtn:        { flexDirection: 'row', alignItems: 'center', gap: 4 },
  backText:       { fontSize: 10, fontWeight: '700', color: COLOR.gold, letterSpacing: 2 },
  followBtn:      { flexDirection: 'row', alignItems: 'center', backgroundColor: COLOR.gold, borderRadius: RADIUS.sm, paddingVertical: 8, paddingHorizontal: 14 },
  followingBtn:   { backgroundColor: 'transparent', borderWidth: 1, borderColor: '#7DC87A44' },
  followBtnText:  { fontSize: 10, fontWeight: '700', color: COLOR.bg, letterSpacing: 1.5 },
  followingBtnText: { color: COLOR.green },
  scroll:         { paddingHorizontal: 16, paddingBottom: 48 },

  identityRow:    { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: '#7DC87A11', marginBottom: 16 },
  avatar:         { width: 60, height: 60, borderRadius: 30, backgroundColor: '#C9A84C22', borderWidth: 1, borderColor: '#C9A84C55', alignItems: 'center', justifyContent: 'center' },
  avatarText:     { fontSize: 22, fontWeight: '600', color: COLOR.gold },
  identityInfo:   { flex: 1 },
  fullName:       { fontSize: 20, fontWeight: '600', color: COLOR.cream },
  username:       { fontSize: 12, color: COLOR.gold, marginTop: 2 },
  homeCourse:     { fontSize: 11, color: COLOR.dim, marginTop: 2 },

  gaugeCard:      { flexDirection: 'row', alignItems: 'center', backgroundColor: COLOR.surface, borderRadius: 20, borderWidth: 1, borderColor: '#7DC87A22', padding: 16, gap: 16, marginBottom: 14 },
  gaugeLeft:      { alignItems: 'center', justifyContent: 'center' },
  gaugeRight:     { flex: 1 },
  credentialRow:  { flexDirection: 'row', gap: 10, paddingHorizontal: 16, marginBottom: 14 },
  credentialCard: { flex: 1, backgroundColor: COLOR.surface, borderRadius: RADIUS.md, borderWidth: 1, borderColor: '#7DC87A22', paddingVertical: 12, paddingHorizontal: 14, alignItems: 'center' },
  credentialLabel:{ fontSize: 8, fontWeight: '700', color: COLOR.dim, letterSpacing: 2, marginBottom: 4 },
  credentialValue:{ fontSize: 22, fontWeight: '300', color: COLOR.cream, fontVariant: ['tabular-nums'] },
  tierLabel:      { fontSize: 11, fontWeight: '700', color: COLOR.green, letterSpacing: 1.5 },
  tierLabelMuted: { fontSize: 9, fontWeight: '700', color: '#C9A84C44', letterSpacing: 1.5 },
  scoreLabel:     { fontSize: 9, fontWeight: '700', color: '#C9A84C66', letterSpacing: 2, marginBottom: 2 },
  scoreValue:     { fontSize: 30, fontWeight: '300', color: COLOR.cream },

  statRow:        { flexDirection: 'row', gap: 8, marginBottom: 20 },
  statCard:       { flex: 1, backgroundColor: COLOR.surface, borderRadius: RADIUS.md, borderWidth: 1, borderColor: '#7DC87A22', paddingVertical: 16, paddingHorizontal: 10, alignItems: 'center' },
  statLabel:      { fontSize: 9, fontWeight: '700', color: COLOR.dim, letterSpacing: 1, textAlign: 'center', marginBottom: 8 },
  statValue:      { fontSize: 22, fontWeight: '300', color: COLOR.cream },

  section:        { marginBottom: 20 },
  sectionLabel:   { fontSize: 9, fontWeight: '700', color: COLOR.dim, letterSpacing: 2, marginBottom: 10 },
  roundCard:      { flexDirection: 'row', alignItems: 'center', backgroundColor: COLOR.surface, borderRadius: RADIUS.md, borderWidth: 1, borderColor: '#7DC87A22', padding: 12, marginBottom: 8, gap: 10 },
  roundInfo:      { flex: 1 },
  roundCourse:    { fontSize: 14, fontWeight: '500', color: COLOR.cream, marginBottom: 2 },
  roundMeta:      { fontSize: 11, color: COLOR.muted },
  roundPop:       { fontSize: 22, fontWeight: '300' },

  emptyRounds:    { alignItems: 'center', paddingVertical: 40 },
  emptyRoundsText:{ fontSize: 16, color: COLOR.dim },

  pubTabBar:      { flexDirection: 'row', paddingHorizontal: 16, paddingVertical: 10, gap: 8, borderBottomWidth: 1, borderBottomColor: '#7DC87A22' },
  pubTabBtn:      { flex: 1, paddingVertical: 8, alignItems: 'center', borderRadius: RADIUS.sm, backgroundColor: COLOR.surface, borderWidth: 1, borderColor: '#7DC87A22' },
  pubTabBtnActive:{ borderColor: COLOR.gold, backgroundColor: '#C9A84C22' },
  pubTabText:     { fontSize: 9, fontWeight: '700', color: COLOR.muted, letterSpacing: 2 },
  pubTabTextActive: { color: COLOR.gold },
  actEmpty:       { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 60, gap: 10 },
  actEmptyText:   { fontSize: 14, color: COLOR.dim },
  actRow:         { flexDirection: 'row', alignItems: 'flex-start', paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#7DC87A11', gap: 12 },
  actIconWrap:    { width: 32, height: 32, borderRadius: RADIUS.lg, alignItems: 'center', justifyContent: 'center' },
  actContent:     { flex: 1 },
  actLabel:       { fontSize: 13, color: COLOR.cream, fontWeight: '500', lineHeight: 18 },
  actPop:         { fontSize: 12, fontWeight: '700', letterSpacing: 0.5, marginTop: 2 },
  actTime:        { fontSize: 10, color: 'rgba(184,168,130,0.5)', marginTop: 3 },

});
